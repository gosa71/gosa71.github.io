const PLAYER_PROVIDER = "https://msx.zona.ms/movies/";

const LOGO_URL =
  "https://png.pngtree.com/png-vector/20211019/ourmid/pngtree-letter-v-logo-png-image_3990434.png";

const VERSION = "1.0.0";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (request.method !== "GET") {
      return jsonResponse(
        {
          error: "Method not allowed",
          message: "Разрешён только GET",
        },
        405
      );
    }

    const pathname = normalizePath(url.pathname);
    const baseUrl = getBaseUrl(url);

    switch (pathname) {
      /*
       * Совместимый стартовый файл для MSX.
       * В MSX указывайте адрес воркера или /start.json.
       */
      case "/":
      case "/start.json":
        return startResponse(baseUrl);

      /*
       * Сам HTML-плеер с iframe и логотипом.
       */
      case "/player":
      case "/player.html":
        return playerResponse(url);

      case "/health":
        return jsonResponse({
          ok: true,
          service: "Zona iframe wrapper",
          version: VERSION,
          time: new Date().toISOString(),
        });

      case "/favicon.ico":
        return new Response(null, {
          status: 204,
        });

      default:
        return jsonResponse(
          {
            error: "Not found",
            pathname,
          },
          404
        );
    }
  },
};

/* ============================================================
   Маршруты
============================================================ */

function normalizePath(pathname) {
  /*
   * Поддерживаются оба варианта:
   *
   * https://example.workers.dev/player.html
   * https://example.com/msx/player.html
   */
  if (pathname === "/msx") {
    return "/";
  }

  if (pathname.startsWith("/msx/")) {
    return pathname.slice("/msx".length) || "/";
  }

  return pathname || "/";
}

function getBaseUrl(url) {
  const hasMsxPrefix =
    url.pathname === "/msx" ||
    url.pathname.startsWith("/msx/");

  return url.origin + (hasMsxPrefix ? "/msx" : "");
}

/* ============================================================
   Старт MSX
============================================================ */

function startResponse(baseUrl) {
  return jsonResponse({
    name: "Zona",
    version: VERSION,

    /*
     * MSX сразу откроет нашу страницу с iframe.
     */
    parameter: `link:${baseUrl}/player.html`,

    launcher: {
      icon: "movie",
    },
  });
}

/* ============================================================
   Страница с iframe
============================================================ */

function playerResponse(requestUrl) {
  const imdbId = String(
    requestUrl.searchParams.get("imdb") ||
      requestUrl.searchParams.get("imdb_id") ||
      ""
  )
    .trim()
    .toLowerCase();

  /*
   * Без параметра открывается главная страница Zona.
   *
   * Если передать:
   * /player.html?imdb=tt0133093
   *
   * откроется:
   * https://msx.zona.ms/movies/tt0133093
   */
  if (imdbId && !/^tt\d{5,12}$/.test(imdbId)) {
    return jsonResponse(
      {
        error: "Invalid IMDb ID",
        message:
          "IMDb ID должен иметь формат tt0133093",
      },
      400
    );
  }

  const embedUrl = imdbId
    ? PLAYER_PROVIDER + encodeURIComponent(imdbId)
    : PLAYER_PROVIDER;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, user-scalable=no"
  >

  <title>Zona</title>

  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #000;
      color: #fff;
      font-family: Arial, sans-serif;
    }

    #container {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: #000;
    }

    #zona-frame {
      display: block;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      background: #000;
    }

    /*
     * Чёрная подложка закрывает старый логотип,
     * а картинка отображается поверх неё.
     */
    #brand-logo {
      position: fixed;
      top: 10px;
      left: 14px;
      z-index: 100;

      display: flex;
      align-items: center;
      justify-content: center;

      width: 66px;
      height: 66px;
      padding: 5px;

      overflow: hidden;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.9);

      pointer-events: none;
      user-select: none;
    }

    #brand-logo img {
      display: block;
      width: 56px;
      height: 56px;
      object-fit: contain;
    }

    #loading {
      position: fixed;
      inset: 0;
      z-index: 90;

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 24px;
      background: #000;
      color: #fff;

      font-size: 20px;
      text-align: center;

      opacity: 1;
      visibility: visible;

      transition:
        opacity 0.25s ease,
        visibility 0.25s ease;

      pointer-events: none;
    }

    #loading.hidden {
      opacity: 0;
      visibility: hidden;
    }

    @media (max-width: 600px) {
      #brand-logo {
        top: 8px;
        left: 8px;

        width: 58px;
        height: 58px;

        padding: 5px;
        border-radius: 10px;
      }

      #brand-logo img {
        width: 48px;
        height: 48px;
      }
    }
  </style>
</head>

<body>
  <div id="container">
    <iframe
      id="zona-frame"
      src="${escapeHtml(embedUrl)}"
      title="Zona"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowfullscreen
      referrerpolicy="no-referrer"
    ></iframe>
  </div>

  <div id="loading">
    Загрузка Zona…
  </div>

  <div id="brand-logo" aria-hidden="true">
    <img
      src="${escapeHtml(LOGO_URL)}"
      alt=""
    >
  </div>

  <script>
    (function () {
      "use strict";

      var frame =
        document.getElementById("zona-frame");

      var loading =
        document.getElementById("loading");

      var loadingHidden = false;

      function hideLoading() {
        if (loadingHidden) {
          return;
        }

        loadingHidden = true;
        loading.classList.add("hidden");
      }

      frame.addEventListener(
        "load",
        hideLoading,
        { once: true }
      );

      /*
       * Убираем заставку, даже если браузер
       * не сообщил о загрузке iframe.
       */
      window.setTimeout(
        hideLoading,
        8000
      );
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/* ============================================================
   Утилиты
============================================================ */

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    function (character) {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };

      return entities[character];
    }
  );
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Origin",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        ...corsHeaders(),
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options":
          "nosniff",
      },
    }
  );
}
