const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  
  const SYSTEM_PROMPT = `
  You are Sidekick, the personal AI companion inside this app.
  
  You are one continuous assistant across the entire app.
  
  You can help the user with information from these app modules:
  
  - Planner
  - Habits
  - Reminders
  - Lists
  - Finance
  - Bookmarks
  - Plants
  - Well-being
  - Games
  
  The app may provide you with data from these modules in the user's request.
  
  IMPORTANT RULES:
  
  1. Only use information actually provided in the app data.
  2. Never invent tasks, habits, reminders, list items, financial information, plants, journal entries, or other user data.
  3. If the relevant app data is not provided, clearly say that you don't currently have that information.
  4. Treat the user as one person across all modules.
  5. You are always Sidekick, not a separate assistant for each module.
  6. Be warm, conversational, practical, and concise.
  7. Keep responses easy to read on a mobile screen.
  8. When useful, refer to specific items by their actual names.
  9. If the user asks what they have to do today, use today's Planner, Habits, Reminders, and Lists data when available.
  10. If the user asks about their schedule, prioritize Planner data.
  11. If the user asks about habits, use Habits data.
  12. If the user asks about reminders, use Reminders data.
  13. If the user asks about lists, use Lists data.
  14. Do not claim that you completed an action unless the app explicitly tells you the action was completed.
  15. At this stage, you are primarily an assistant that READS app data. Do not pretend that you can modify app data unless the request is explicitly supported by the app.
  `;
  
  type AppData = {
    planner?: unknown;
    habits?: unknown;
    reminders?: unknown;
    lists?: unknown;
    finance?: unknown;
    bookmarks?: unknown;
    plants?: unknown;
    wellbeing?: unknown;
    games?: unknown;
  };
  
  function jsonResponse(
    body: Record<string, unknown>,
    status = 200,
  ) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
  
  Deno.serve(async (req: Request) => {
    // ---------------------------------------------------------
    // OPTIONS / CORS
    // ---------------------------------------------------------
  
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        status: 200,
        headers: corsHeaders,
      });
    }
  
    // ---------------------------------------------------------
    // ONLY POST
    // ---------------------------------------------------------
  
    if (req.method !== 'POST') {
      return jsonResponse(
        {
          error: 'Method not allowed',
        },
        405,
      );
    }
  
    try {
      // -------------------------------------------------------
      // READ REQUEST
      // -------------------------------------------------------
  
      let body: {
        message?: unknown;
        appData?: AppData;
      };
  
      try {
        body = await req.json();
      } catch {
        return jsonResponse(
          {
            error: 'Invalid request.',
          },
          400,
        );
      }
  
      const message =
        typeof body.message === 'string'
          ? body.message.trim()
          : '';
  
      if (!message) {
        return jsonResponse(
          {
            error: 'Message is required.',
          },
          400,
        );
      }
  
      // -------------------------------------------------------
      // ANTHROPIC KEY
      // -------------------------------------------------------
  
      const anthropicKey =
        Deno.env.get('ANTHROPIC_API_KEY');
  
      if (!anthropicKey) {
        console.error(
          'ANTHROPIC_API_KEY is not configured',
        );
  
        return jsonResponse(
          {
            error:
              'Sidekick is unavailable right now.',
          },
          503,
        );
      }
  
      // -------------------------------------------------------
      // APP DATA
      // -------------------------------------------------------
  
      const appData: AppData = body.appData ?? {};
  
      /*
       * Keep the data clearly separated so Claude knows
       * that this is application data and not instructions.
       */
  
      const appContext = `
  APP DATA AVAILABLE TO SIDEKICK
  
  Planner:
  ${JSON.stringify(appData.planner ?? [], null, 2)}
  
  Habits:
  ${JSON.stringify(appData.habits ?? [], null, 2)}
  
  Reminders:
  ${JSON.stringify(appData.reminders ?? [], null, 2)}
  
  Lists:
  ${JSON.stringify(appData.lists ?? [], null, 2)}
  
  Finance:
  ${JSON.stringify(appData.finance ?? [], null, 2)}
  
  Bookmarks:
  ${JSON.stringify(appData.bookmarks ?? [], null, 2)}
  
  Plants:
  ${JSON.stringify(appData.plants ?? [], null, 2)}
  
  Well-being:
  ${JSON.stringify(appData.wellbeing ?? [], null, 2)}
  
  Games:
  ${JSON.stringify(appData.games ?? [], null, 2)}
  `;
  
      // -------------------------------------------------------
      // ANTHROPIC REQUEST
      // -------------------------------------------------------
  
      const anthropicResponse = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
  
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
  
          body: JSON.stringify({
            // Cheap model for now.
            model: 'claude-3-5-haiku-20241022',
  
            // Keep Sidekick responses short.
            max_tokens: 700,
  
            system: SYSTEM_PROMPT,
  
            messages: [
              {
                role: 'user',
                content: `
  USER MESSAGE:
  
  ${message}
  
  ${appContext}
  
  Use the app data above when it is relevant to the user's question.
  `,
              },
            ],
          }),
        },
      );
  
      // -------------------------------------------------------
      // READ ANTHROPIC RESPONSE
      // -------------------------------------------------------
  
      let result: any;
  
      try {
        result = await anthropicResponse.json();
      } catch {
        console.error(
          'Could not read Anthropic response.',
        );
  
        return jsonResponse(
          {
            error:
              'Sidekick is unavailable right now.',
          },
          503,
        );
      }
  
      // -------------------------------------------------------
      // ANTHROPIC ERROR HANDLING
      // -------------------------------------------------------
  
      if (!anthropicResponse.ok) {
        const errorType =
          result?.error?.type ?? '';
  
        const errorMessage =
          result?.error?.message ?? '';
  
        console.error(
          'Anthropic API error:',
          JSON.stringify(result),
        );
  
        /*
         * Specifically handle insufficient credits.
         */
  
        if (
          errorMessage
            .toLowerCase()
            .includes('credit balance') ||
          errorMessage
            .toLowerCase()
            .includes('credits') ||
          errorType === 'invalid_request_error'
        ) {
          return jsonResponse(
            {
              error:
                'Sidekick is unavailable right now.',
            },
            503,
          );
        }
  
        /*
         * Handle rate limits.
         */
  
        if (anthropicResponse.status === 429) {
          return jsonResponse(
            {
              error:
                'Sidekick is temporarily busy. Please try again shortly.',
            },
            429,
          );
        }
  
        /*
         * Handle Anthropic server errors.
         */
  
        if (anthropicResponse.status >= 500) {
          return jsonResponse(
            {
              error:
                'Sidekick is temporarily unavailable. Please try again shortly.',
            },
            503,
          );
        }
  
        /*
         * Do not expose Anthropic's raw API error
         * to the mobile/web application.
         */
  
        return jsonResponse(
          {
            error:
              'Sidekick is unavailable right now.',
          },
          503,
        );
      }
  
      // -------------------------------------------------------
      // EXTRACT TEXT
      // -------------------------------------------------------
  
      const reply =
        Array.isArray(result?.content)
          ? result.content
              .filter(
                (item: { type?: string }) =>
                  item?.type === 'text',
              )
              .map(
                (item: { text?: string }) =>
                  item?.text ?? '',
              )
              .join('\n')
              .trim()
          : '';
  
      if (!reply) {
        console.error(
          'Anthropic returned no text.',
          JSON.stringify(result),
        );
  
        return jsonResponse(
          {
            error:
              'Sidekick could not generate a response.',
          },
          502,
        );
      }
  
      // -------------------------------------------------------
      // SUCCESS
      // -------------------------------------------------------
  
      return jsonResponse({
        reply,
      });
    } catch (error) {
      console.error(
        'Sidekick Edge Function error:',
        error,
      );
  
      return jsonResponse(
        {
          error:
            'Sidekick is unavailable right now.',
        },
        503,
      );
    }
  });