import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  MemoryCorruptionError,
  MemoryPersistenceError,
  MemoryRecoveryError,
} from "./memory-errors";
import { parseStoreText, serializeStoreMap } from "./memory-serializer";
import type { MemoryHealth, MemoryStoreOptions, UserWeightMemory } from "./memory-types";

const DEFAULT_FILE_NAME = "weight-management-memory.json";
const DEFAULT_PRODUCTION_PATH = path.resolve(process.cwd(), "data", DEFAULT_FILE_NAME);
const CURRENT_SUFFIX = ".current";
const PREVIOUS_SUFFIX = ".previous";
const LOCK_RETRY_MS = 25;
const LOCK_RETRY_MAX = 60;

export class MemoryPersistenceAdapter {
  readonly dataDir: string;
  readonly filePath: string;
  readonly backupPath: string;
  readonly lockPath: string;
  readonly productionPath: string;
  readonly allowProduction: boolean;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: MemoryStoreOptions = {}) {
    const configuredDir = options.dataDir ?? process.env.MEMORY_DATA_DIR ?? path.resolve(process.cwd(), "data");
    const fileName = options.fileName ?? DEFAULT_FILE_NAME;
    this.dataDir = path.resolve(configuredDir);
    this.filePath = path.resolve(this.dataDir, fileName);
    this.backupPath = path.resolve(this.dataDir, `${path.basename(fileName)}${PREVIOUS_SUFFIX}`);
    this.lockPath = path.resolve(this.dataDir, `${path.basename(fileName)}${CURRENT_SUFFIX}.lock`);
    this.productionPath = path.resolve(options.productionPath ?? DEFAULT_PRODUCTION_PATH);
    this.allowProduction = options.allowProduction ?? false;

    if (!this.allowProduction && this.filePath === this.productionPath) {
      throw new MemoryPersistenceError("Refusing to use the production memory path in a test or non-production runtime.", {
        path: this.filePath,
      });
    }
  }

  private async ensureDir(): Promise<void> {
    await fs.promises.mkdir(this.dataDir, { recursive: true });
  }

  private async readFileIfExists(): Promise<string | null> {
    try {
      return await fs.promises.readFile(this.filePath, "utf8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null;
      }
      throw new MemoryPersistenceError(`Unable to read memory file at ${this.filePath}.`, {
        path: this.filePath,
        code: err.code ?? "UNKNOWN",
      });
    }
  }

  private async readRawSnapshot(targetPath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(targetPath, "utf8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null;
      }
      throw new MemoryPersistenceError(`Unable to read snapshot at ${targetPath}.`, {
        path: targetPath,
        code: err.code ?? "UNKNOWN",
      });
    }
  }

  private async atomicWrite(json: string): Promise<void> {
    await this.ensureDir();
    const dir = this.dataDir;
    const tempPath = path.join(dir, `.${path.basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`);

    try {
      const currentBytes = await this.readFileIfExists();
      if (currentBytes) {
        await fs.promises.copyFile(this.filePath, this.backupPath).catch(() => undefined);
      }

      await fs.promises.writeFile(tempPath, json, "utf8");
      const tempText = await fs.promises.readFile(tempPath, "utf8");
      parseStoreText(tempText, tempPath, "commit");

      await fs.promises.rename(tempPath, this.filePath);
      await fs.promises.copyFile(this.filePath, this.backupPath).catch(() => undefined);
    } catch (error) {
      try {
        await fs.promises.unlink(tempPath).catch(() => undefined);
      } catch {
        // ignore cleanup failure
      }
      throw new MemoryPersistenceError(`Atomic write failed for ${this.filePath}.`, {
        path: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async mutate<T>(
    mutator: (store: Record<string, UserWeightMemory>) => T
  ): Promise<T> {
    return this.withQueue(() => this.withLock(async () => {
      const currentBytes = await this.readFileIfExists();

      let store: Record<string, UserWeightMemory> = {};

      if (currentBytes) {
        store = parseStoreText(
          currentBytes,
          this.filePath,
          "mutate-read"
        );
      }

      const result = mutator(store);

      const json = serializeStoreMap(
        store,
        new Date().toISOString()
      );

      await this.atomicWrite(json);

      return result;
    }));
  }

  private async withLock<T>(work: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    let attempt = 0;

    while (true) {
      try {
        await fs.promises.mkdir(this.lockPath, { recursive: false });
        break;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "EEXIST" && err.code !== "EPERM") {
          throw new MemoryPersistenceError(`Unable to acquire memory lock for ${this.filePath}.`, {
            path: this.filePath,
            code: err.code ?? "UNKNOWN",
          });
        }

        if (Date.now() - startedAt > 5000) {
          throw new MemoryPersistenceError(`Timed out waiting for memory lock for ${this.filePath}.`, {
            path: this.filePath,
            retryCount: attempt,
          });
        }

        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(LOCK_RETRY_MS * attempt, 250)));
      }
    }

    try {
      return await work();
    } finally {
      await fs.promises.rmdir(this.lockPath, { recursive: false }).catch(() => undefined);
    }
  }

  private withQueue<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    const next = previous.then(work, work);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async read(): Promise<Record<string, UserWeightMemory>> {
    return this.withQueue(() => this.withLock(async () => {
      const currentBytes = await this.readFileIfExists();
      if (!currentBytes) {
        return {};
      }

      try {
        return parseStoreText(currentBytes, this.filePath, "read");
      } catch (error) {
        if (error instanceof MemoryCorruptionError) {
          const previousBytes = await this.readRawSnapshot(this.backupPath);
          if (previousBytes) {
            try {
              return parseStoreText(previousBytes, this.backupPath, "recovery");
            } catch {
              throw new MemoryCorruptionError(`Current store is corrupt and recovery snapshot is also invalid.`, {
                filePath: this.filePath,
                operation: "read",
                position: null,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
        throw error;
      }
    }));
  }

  async write(store: Record<string, UserWeightMemory>): Promise<void> {
    return this.withQueue(() => this.withLock(async () => {
      const json = serializeStoreMap(store, new Date().toISOString());
      await this.atomicWrite(json);
    }));
  }

  async getHealth(): Promise<MemoryHealth> {
    try {
      const currentExists = await this.readFileIfExists();
      if (!currentExists) {
        return {
          healthy: true,
          exists: false,
          readable: true,
          valid: true,
          recoverable: true,
          bytes: 0,
          path: this.filePath,
        };
      }

      const parsed = parseStoreText(currentExists, this.filePath, "health");
      return {
        healthy: true,
        exists: true,
        readable: true,
        valid: true,
        recoverable: true,
        bytes: Buffer.byteLength(currentExists, "utf8"),
        updatedAt: new Date().toISOString(),
        path: this.filePath,
      };
    } catch (error) {
      return {
        healthy: false,
        exists: await this.readFileIfExists().then(Boolean).catch(() => false),
        readable: true,
        valid: false,
        recoverable: false,
        bytes: 0,
        path: this.filePath,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async recoverPreviousIfNeeded(): Promise<Record<string, UserWeightMemory>> {
    const current = await this.readFileIfExists();
    if (!current) {
      return {};
    }

    try {
      return parseStoreText(current, this.filePath, "recover");
    } catch (error) {
      if (!(error instanceof MemoryCorruptionError)) {
        throw error;
      }

      const previousBytes = await this.readRawSnapshot(this.backupPath);
      if (!previousBytes) {
        throw new MemoryRecoveryError(`No valid previous memory snapshot exists for ${this.filePath}.`, {
          path: this.filePath,
        });
      }

      try {
        return parseStoreText(previousBytes, this.backupPath, "recover");
      } catch (recoveryError) {
        throw new MemoryRecoveryError(`Recovery snapshot is also corrupt for ${this.filePath}.`, {
          path: this.filePath,
          underlying: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        });
      }
    }
  }
}
