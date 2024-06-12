import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as KMS from "@aws-sdk/client-kms";

import fs from "fs";
export interface KeyConfig {
  keyID: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  fileKey: string;
}

export interface AwskmsConfig {
  [network: string]: {
    [keyName: string]: KeyConfig;
  };
}

interface AwsS3StorageConfig {
  bucket: string;
  key: string;
}

const { AWS_S3_STORAGE_CONFIG } = process.env;
const storageConfig: AwsS3StorageConfig = AWS_S3_STORAGE_CONFIG ? JSON.parse(AWS_S3_STORAGE_CONFIG) : undefined;

export function getAwskmsConfig(keys: string[]): KeyConfig[] {
  let configOverride: AwskmsConfig = {};
  if (process.env.AWSKMS_CONFIG) {
    configOverride = JSON.parse(process.env.AWSKMS_CONFIG);
  } else {
    const overrideFname = ".AwskmsOverride.js";
    try {
      if (fs.existsSync(`${__dirname}/${overrideFname}`)) {
        configOverride = require(`./${overrideFname}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  const keyConfigs = keys.map((keyName: string): KeyConfig => {
    return (configOverride["mainnet"][keyName] || {}) as KeyConfig; // Hardcode to "mainnet" network. This makes no impact key retrieval.
  });

  return keyConfigs;
}

export const downloadEncryptedKey = async (config: KeyConfig): Promise<Uint8Array | undefined> => {
  const command = new GetObjectCommand({
    Bucket: storageConfig.bucket,
    Key: storageConfig.key,
  });
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  try {
    const response = await client.send(command);
    // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
    return response.Body?.transformToByteArray();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
};

export async function retrieveAwskmsKeys(awskmsConfigs: KeyConfig[]): Promise<string[]> {
  return await Promise.all(
    awskmsConfigs.map(async (config) => {
      const encryptedFileContent = await downloadEncryptedKey(config);
      const input: KMS.DecryptCommandInput = {
        KeyId: config.keyID,
        CiphertextBlob: encryptedFileContent,
        EncryptionAlgorithm: "SYMMETRIC_DEFAULT",
      };
      const decryptCommand = new KMS.DecryptCommand(input);

      const client = new KMS.KMS({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });

      const data = await client.send(decryptCommand);
      if (!(data.Plaintext instanceof Uint8Array)) {
        throw new Error("result.plaintext wrong type");
      }

      return "0x" + Buffer.from(data.Plaintext).toString().trim();
    })
  );
}
