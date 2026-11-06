import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { runableManagedAuth } from '@runablehq/managed-auth/server';
import { db } from './database';

export const auth = betterAuth({
  basePath: '/api/auth', baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true }, secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.WEBSITE_URL!, 'http://localhost:4200', 'http://127.0.0.1:4200'],
  plugins: [...runableManagedAuth({ applicationId: process.env.APPLICATION_ID!, issuer: process.env.VITE_RUNABLE_AUTH_ISSUER! })],
});