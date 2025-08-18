// Fix to console log in single line, and add error message to log.
import winston from "winston";
import { createNewLogger, createConsoleTransport } from "@uma/logger";

const transports = process.env.DEBUG_LOG === "true" ? [createConsoleTransport()] : [new winston.transports.Console()];
const config = process.env.DEBUG_LOG === "true" ? {} : { createConsoleTransport: false };

export const Logger = createNewLogger(transports, config);

export type DefaultLogLevels = "debug" | "info" | "warn" | "error";

export function stringifyThrownValue(value: unknown): string {
  if (value instanceof Error) {
    const errToString = value.toString();
    return value.stack
      ? value.stack
      : value.message || errToString !== "[object Object]"
      ? errToString
      : `could not extract error from 'Error' instance ${errToString}`;
  } else if (value instanceof Object) {
    const objStringified = JSON.stringify(value);
    return objStringified !== "{}"
      ? objStringified
      : `could not extract error from 'Object' instance ${objStringified}`;
  } else {
    return `ThrownValue: ${value.toString()}`;
  }
}
