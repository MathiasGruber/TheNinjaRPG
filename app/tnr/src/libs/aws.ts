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
  const s3Client = new S3Client({});
  const uploadCommand = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: new Uint8Array(blob),
  });
  const expectedUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  const result = await s3Client.send(uploadCommand);
  return result.$metadata.httpStatusCode == 200 ? expectedUrl : null;
};
