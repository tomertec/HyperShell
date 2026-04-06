import { z } from "zod";

const secretReferenceSchema = z.object({
  secretId: z.string().min(1)
});

export const passwordAuthSchema = z.object({
  type: z.literal("password"),
  username: z.string().min(1),
  password: secretReferenceSchema
});

export const keyFileAuthSchema = z.object({
  type: z.literal("keyfile"),
  username: z.string().min(1),
  privateKeyPath: z.string().min(1),
  passphrase: secretReferenceSchema.optional()
});

export const agentAuthSchema = z.object({
  type: z.literal("agent"),
  username: z.string().min(1),
  agentKind: z.enum(["system", "pageant", "1password"]).default("system")
});

export const onePasswordReferenceAuthSchema = z.object({
  type: z.literal("op-reference"),
  username: z.string().min(1),
  reference: z.string().startsWith("op://")
});

export const authProfileSchema = z.discriminatedUnion("type", [
  passwordAuthSchema,
  keyFileAuthSchema,
  agentAuthSchema,
  onePasswordReferenceAuthSchema
]);

export type AuthProfile = z.infer<typeof authProfileSchema>;
