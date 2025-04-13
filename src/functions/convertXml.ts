import { app } from "@azure/functions";
import { MongoClient } from "mongodb";
import { BlobServiceClient } from "@azure/storage-blob";
import * as dotenv from "dotenv";

dotenv.config();
export async function convertXml(req: any, context: any): Promise<any> {
    const key: string | undefined = req.query?.key || req.body?.key;
    if (!key) {
        return {
            status: 400,
            body: "Missing 'key' parameter",
        };
        ;
    }

    const mongoUri = process.env.MONGO_URI;
    const mongoDbName = process.env.MONGO_DB_NAME;
    const mongoCollection = process.env.MONGO_COLLECTION;
    const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobContainerName = process.env.AZURE_BLOB_CONTAINER_NAME;

    if (!mongoUri || !mongoDbName || !mongoCollection || !storageConnectionString || !blobContainerName) {
        return {
            status: 500,
            body: "Missing required environment variables",
        };
    }

    let mongoClient: MongoClient | null = null;

    try {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        const db = mongoClient.db(mongoDbName);
        const collection = db.collection(mongoCollection);

        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(blobContainerName);
        const blobClient = containerClient.getBlobClient(key);

        const exists = await blobClient.exists();
        if (!exists) {
            return {
                status: 404,
                body: "Blob not found",
            };
            return;
        }

        const downloadBlockBlobResponse = await blobClient.download();
        const content = await streamToString(downloadBlockBlobResponse.readableStreamBody!);

        // Save to MongoDB
        const result = await collection.insertOne({
            key,
            content,
            createdAt: new Date(),
        });

        return {
            status: 200,
            body: {
                message: "File content saved to MongoDB",
                insertedId: result.insertedId,
            },
        };
    } catch (error) {
        console.log("Error:", error);
        return {
            status: 500,
            body: "Internal server error",
        };
    } finally {
        // Đảm bảo đóng kết nối MongoDB
        if (mongoClient) {
            await mongoClient.close();
        }
    }
};
async function streamToString(
    readableStream: NodeJS.ReadableStream
): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        readableStream.on("data", (data: Buffer | string) => {
            chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        });
        readableStream.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        readableStream.on("error", reject);
    });
}

app.http('convertXml', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: convertXml
});
