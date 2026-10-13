import type {NextConfig} from 'next';
const nextConfig:NextConfig={
  serverExternalPackages:['nodemailer'],
  webpack(config, {nextRuntime}) {
    // nodemailer (used only from the Node.js-only scheduler) pulls in Node core
    // modules like 'stream' that don't exist in the edge runtime. instrumentation.ts
    // already gates the import behind a NEXT_RUNTIME==='nodejs' check, but `next dev`
    // doesn't dead-code-eliminate that branch, so the edge bundle still tries to
    // resolve nodemailer. Stub it out for the edge bundle only.
    if (nextRuntime === 'edge') {
      config.resolve.alias = {...config.resolve.alias, nodemailer: false};
    }
    return config;
  },
};
export default nextConfig;
