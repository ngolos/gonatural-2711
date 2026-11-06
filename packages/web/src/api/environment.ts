// Server environment typing also follows router types into other clients.
declare global {
 namespace NodeJS {
  interface ProcessEnv {
   [key: string]: string | undefined;
  }
 }
}
export {};