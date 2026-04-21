import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type JsonNormalizer<T> = (input: unknown) => T | null;

function isMissingObjectError(error: { message?: string; statusCode?: string | number } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  const statusCode = String(error?.statusCode ?? "");

  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    statusCode === "404"
  );
}

async function ensureBucket(bucketName: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage.getBucket(bucketName);
  if (!error && data) {
    return supabase;
  }

  if (!isMissingObjectError(error)) {
    throw error;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError;
  }

  return supabase;
}

export async function readJsonObject<T>(
  bucketName: string,
  objectPath: string,
  normalize: JsonNormalizer<T>,
) {
  const supabase = await ensureBucket(bucketName);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(objectPath);

  if (error) {
    if (isMissingObjectError(error)) {
      return null;
    }

    throw error;
  }

  try {
    return normalize(JSON.parse(await data.text()));
  } catch {
    return null;
  }
}

export async function writeJsonObject(
  bucketName: string,
  objectPath: string,
  payload: unknown,
) {
  const supabase = await ensureBucket(bucketName);

  if (!supabase) {
    return false;
  }

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, JSON.stringify(payload), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "0",
    });

  if (error) {
    throw error;
  }

  return true;
}

export async function uploadPrivateObject(
  bucketName: string,
  objectPath: string,
  file: File,
) {
  const supabase = await ensureBucket(bucketName);

  if (!supabase) {
    return null;
  }

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
      cacheControl: "0",
    });

  if (error) {
    throw error;
  }

  return objectPath;
}

export async function downloadPrivateObject(
  bucketName: string,
  objectPath: string,
) {
  const supabase = await ensureBucket(bucketName);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(objectPath);

  if (error) {
    if (isMissingObjectError(error)) {
      return null;
    }

    throw error;
  }

  return data;
}
