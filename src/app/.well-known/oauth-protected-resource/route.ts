import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

const handler = protectedResourceHandler({
  authServerUrls: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
