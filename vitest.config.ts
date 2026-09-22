import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Dos tandas de tests:
//   - unit:   funciones puras (geometría, notas, tags, validación, cookie), en
//             Node, sin nada de Cloudflare.
//   - worker: el Worker entero dentro de workerd (el runtime de verdad), con una
//             D1 y una R2 locales y vacías, migraciones aplicadas. Son los que
//             prueban las rutas, las consultas y las transacciones.
export default defineConfig(async () => {
  const migraciones = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          test: { name: "unit", include: ["test/unit/**/*.test.{js,ts}"] },
        },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.toml" },
              miniflare: {
                // El workerd que trae @cloudflare/vitest-pool-workers va unas
                // semanas por detrás del de wrangler y no acepta la fecha de
                // wrangler.toml. Para los tests da igual: no usamos nada de
                // estas últimas semanas. Quitarlo cuando el paquete se ponga al día.
                compatibilityDate: "2026-08-15",
                // Se pisan los de .dev.vars para que los tests no dependan de
                // qué contraseña tenga cada uno en local.
                bindings: {
                  TEST_MIGRATIONS: migraciones,
                  PASSWORD: "contraseña-de-test",
                  AUTH_SECRET: "secreto-de-test",
                },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["test/worker/**/*.test.ts"],
            setupFiles: ["./test/worker/migrar.ts"],
          },
        },
      ],
    },
  };
});
