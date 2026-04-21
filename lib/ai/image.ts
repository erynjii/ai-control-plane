export type GeneratedImage = {
  buffer: Buffer;
  contentType: string;
};

type ImageApiResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: { message?: string };
};

async function fetchImageBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateImageWithOpenAI({
  apiKey,
  prompt,
  size = "1024x1024"
}: {
  apiKey: string;
  prompt: string;
  size?: string;
}): Promise<GeneratedImage> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      n: 1
    })
  });

  const payload = (await response.json().catch(() => null)) as ImageApiResponse | null;

  if (!response.ok || !payload) {
    const message = payload?.error?.message || `Image API ${response.status}`;
    throw new Error(message);
  }

  const first = payload.data?.[0];
  if (!first) {
    throw new Error("Image API returned no data.");
  }

  if (first.b64_json) {
    return { buffer: Buffer.from(first.b64_json, "base64"), contentType: "image/png" };
  }

  if (first.url) {
    const buffer = await fetchImageBytes(first.url);
    return { buffer, contentType: "image/png" };
  }

  throw new Error("Image API returned neither b64_json nor url.");
}
