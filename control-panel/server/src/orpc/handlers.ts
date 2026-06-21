import { redact } from "@control-panel/api/core-bridge/redact";
import { appRouter } from "@control-panel/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

function logRpcError(error: unknown) {
	if (error instanceof Error) {
		console.error(
			redact(error.message),
			error.stack ? redact(error.stack) : undefined
		);
	} else {
		console.error(error);
	}
}

export function createOpenApiHandler() {
	return new OpenAPIHandler(appRouter, {
		plugins: [
			new OpenAPIReferencePlugin({
				schemaConverters: [new ZodToJsonSchemaConverter()],
			}),
		],
		interceptors: [onError(logRpcError)],
	});
}

export function createRpcHandler() {
	return new RPCHandler(appRouter, {
		interceptors: [onError(logRpcError)],
	});
}
