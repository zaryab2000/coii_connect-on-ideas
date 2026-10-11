// The two Node APIs the backend e2e suite uses (env from the runner, psql through docker),
// declared narrowly instead of pulling @types/node into a browser-first program.
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { readonly encoding: "utf8" },
  ): string;
}
