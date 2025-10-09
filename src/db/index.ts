import { neon } from "@neondatabase/serverless";

export const getDbConnection = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(process.env.DATABASE_URL);
  return sql;
};

export const isDev = process.env.NODE_ENV === "development";
