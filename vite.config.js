import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MAX_API_BODY_BYTES = 1024 * 1024;

function localBillsApi() {
  return {
    name: "local-bills-api",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      process.env.MONGODB_URI ||= env.MONGODB_URI;
      process.env.MONGODB_DB ||= env.MONGODB_DB;
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (url.pathname !== "/api/bills") {
          next();
          return;
        }

        request.query = Object.fromEntries(url.searchParams);

        if (request.method === "POST") {
          try {
            const chunks = [];
            let bodyLength = 0;
            for await (const chunk of request) {
              bodyLength += chunk.length;
              if (bodyLength > MAX_API_BODY_BYTES) {
                const error = new Error("Request body exceeds the 1 MB limit.");
                error.statusCode = 413;
                throw error;
              }
              chunks.push(chunk);
            }
            request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch (error) {
            const status = error.statusCode || 400;
            response.statusCode = status;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              error: status === 413 ? error.message : "Request body must contain valid JSON."
            }));
            return;
          }
        }

        try {
          const { default: billsApi } = await import("./server/billsApi.js");
          const apiResponse = {
            status(statusCode) {
              response.statusCode = statusCode;
              return this;
            },
            setHeader(name, value) {
              response.setHeader(name, value);
              return this;
            },
            end(body) {
              response.end(body);
            }
          };
          await billsApi(request, apiResponse);
        } catch (error) {
          next(error);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [localBillsApi(), react(), tailwindcss()]
});
