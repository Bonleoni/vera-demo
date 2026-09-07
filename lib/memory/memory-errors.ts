export class MemoryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "MemoryError";
  }
}

export class MemoryPersistenceError extends MemoryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "MEMORY_PERSISTENCE_ERROR");
    if (details) {
      Object.assign(this, details);
    }
  }
}

export class MemoryCorruptionError extends MemoryError {
  constructor(
    message: string,
    details: {
      filePath: string;
      operation: string;
      position?: number | null;
      error?: string;
      timestamp?: string;
    },
  ) {
    super(message, "MEMORY_CORRUPTION_ERROR");
    this.name = "MemoryCorruptionError";
    Object.assign(this, details);
  }
}

export class MemoryValidationError extends MemoryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "MEMORY_VALIDATION_ERROR");
    if (details) {
      Object.assign(this, details);
    }
  }
}

export class MemoryRecoveryError extends MemoryError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "MEMORY_RECOVERY_ERROR");
    if (details) {
      Object.assign(this, details);
    }
  }
}
