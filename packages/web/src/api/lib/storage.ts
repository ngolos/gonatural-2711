import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
export const s3 = new S3Client({ region: 'auto', endpoint: process.env.S3_ENDPOINT, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
export const bucket = process.env.S3_BUCKET!;
export async function objectStream(key: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return object.Body!.transformToWebStream();
}