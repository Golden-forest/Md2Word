import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  // Next 16 regenerates AGENTS.md/CLAUDE.md on every dev run; we keep our own
  // project docs, so disable the auto-generated agent-rule files.
  agentRules: false,
};

export default nextConfig;
