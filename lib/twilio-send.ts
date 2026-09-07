type TwilioSendResult = {
  sid: string;
  status: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function normalizeWhatsAppAddress(input: string): string {
  const value = String(input ?? "").trim();
  if (!value) {
    throw new Error("Target number is required.");
  }

  if (value.toLowerCase().startsWith("whatsapp:")) {
    return value;
  }

  if (value.startsWith("+")) {
    return `whatsapp:${value}`;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Invalid target number.");
  }

  return `whatsapp:+${digits}`;
}

export async function sendWhatsApp(to: string, text: string): Promise<TwilioSendResult> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const apiKeySid = requireEnv("TWILIO_API_KEY_SID");
  const apiKeySecret = requireEnv("TWILIO_API_KEY_SECRET");
  const from = normalizeWhatsAppAddress(requireEnv("TWILIO_WHATSAPP_NUMBER"));
  const toAddress = normalizeWhatsAppAddress(to);
  const bodyText = String(text ?? "").trim();

  if (!bodyText) {
    throw new Error("Message text is required.");
  }

  const authToken = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64");
  const form = new URLSearchParams();
  form.set("From", from);
  form.set("To", toAddress);
  form.set("Body", bodyText);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const payload = await response.json().catch(() => null) as {
    sid?: string;
    status?: string;
    message?: string;
    code?: number;
    more_info?: string;
  } | null;

  if (!response.ok) {
    const message = payload?.message ?? `Twilio request failed (${response.status}).`;
    throw new Error(message);
  }

  return {
    sid: payload?.sid ?? "",
    status: payload?.status ?? "queued",
  };
}
