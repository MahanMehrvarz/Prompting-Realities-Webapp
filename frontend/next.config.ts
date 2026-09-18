import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The DDW, 4TU and CHItaly paper links point at /about. It must not break.
      // Explicit 301 rather than `permanent: true`, which Next serves as a 308.
      { source: "/about", destination: "/", statusCode: 301 },

      // Safety net for the old entry point. The Control Hub used to live at `/`
      // and reads `?redirect=` / `?session=` off the query string. Nothing in the
      // app constructs such links — but a bookmark or a hand-made URL might, and
      // after the move those params would land on the marketing page and be
      // silently dropped. Forward them to the hub with the query intact.
      {
        source: "/",
        has: [{ type: "query", key: "redirect", value: "(?<redirect>.*)" }],
        destination: "/login?redirect=:redirect",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "query", key: "session", value: "(?<session>.*)" }],
        destination: "/login?session=:session",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
