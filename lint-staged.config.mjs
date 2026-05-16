const lintStagedConfig = {
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{css,md,mdx,json,yaml,yml}": "prettier --write",
};

export default lintStagedConfig;
