interface GyazoResponse {
  image_id?: string;
  permalink_url?: string;
  thumb_url?: string;
  url?: string;
  type?: string;
}

const GYAZO_UPLOAD_URL = "https://upload.gyazo.com/api/upload";

const guessFileName = (sourceUrl: string, fallback: string) => {
  try {
    const url = new URL(sourceUrl);
    const last = url.pathname.split("/").pop();
    return last || fallback;
  } catch {
    return fallback;
  }
};

const fetchImage = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "zedi-thumbnail-api/1.0 (https://zedi.app)",
      Accept: "image/*,*/*;q=0.8",
      "Accept-Language": "ja,en;q=0.8",
      Referer: url,
    },
  });
  return response;
};

export async function uploadToGyazo(
  sourceUrl: string,
  accessToken: string,
  title?: string,
  fallbackUrl?: string
): Promise<{ imageUrl: string; permalinkUrl?: string }> {
  let response = await fetchImage(sourceUrl);
  if (!response.ok && fallbackUrl) {
    response = await fetchImage(fallbackUrl);
  }
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("画像ファイルではありません");
  }

  const blob = await response.blob();
  const fileName = guessFileName(
    response.url || sourceUrl,
    `thumbnail-${Date.now()}.${contentType.split("/")[1] || "jpg"}`
  );

  const formData = new FormData();
  formData.append("access_token", accessToken);
  if (title) {
    formData.append("title", title);
  }
  formData.append("imagedata", blob, fileName);

  const uploadResponse = await fetch(GYAZO_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(`Gyazo upload failed: ${uploadResponse.status} ${errorText}`);
  }

  const data = (await uploadResponse.json()) as GyazoResponse;
  if (!data.url) {
    throw new Error("Gyazo upload failed: No URL returned");
  }

  return {
    imageUrl: data.url,
    permalinkUrl: data.permalink_url,
  };
}
