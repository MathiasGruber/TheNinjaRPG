import AWS from "aws-sdk";

/**
 * Uploads a given remote image URL to S3 under a given key
 * @param url - URL of image to upload to S3
 */
export const uploadAvatar = async (
  url: string,
  key: string
): Promise<string> => {
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  });
  const res = await fetch(url);
  const blob = await res.arrayBuffer();
  const uploadedImage = await s3
    .upload({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(blob),
    })
    .promise();
  return uploadedImage.Location;
};
