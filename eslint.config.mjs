import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    rules: {
      // Every route is rendered by one catch-all server page that loads its data per request
      // (app/[[...path]]/page.tsx), so links deliberately use full document navigation. Many are
      // also API downloads (/api/media, /api/account/export) that must not become client routes.
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-location-assign-relative-destination": "off",
      // Images are pre-sized WEBP previews or private /api/media files that need the visitor's
      // session cookie; the Next image optimizer is not part of this Worker deployment.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
