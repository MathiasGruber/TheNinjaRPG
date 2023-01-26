import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Uploads a given remote image URL to S3 under a given key
 * @param url - URL of image to upload to S3
 */
export const uploadAvatar = async (url: string, key: string) => {
  // Get image from AI service (will expire within 1 hour)
  const res = await fetch(url);
  const blob = await res.arrayBuffer();
  // Upload to S3
  const s3Client = new S3Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    region: process.env.AWS_REGION,
  });
  const uploadCommand = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: new Uint8Array(blob),
  });
  const expectedUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  const result = await s3Client.send(uploadCommand);
  if (result.$metadata.httpStatusCode == 200) {
    return expectedUrl;
  } else {
    console.error("Error uploading: ", result);
  }
  return null;
};
