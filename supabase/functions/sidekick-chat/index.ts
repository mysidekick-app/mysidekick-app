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

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    type?: string;
    message?: string;
  };
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

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
          error: 'Sidekick diagnostic: Invalid JSON request.',
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
      console.error('Sidekick diagnostic: ANTHROPIC_API_KEY is missing.');

      return jsonResponse(
        {
          error:
            'Sidekick diagnostic: ANTHROPIC_API_KEY is missing.',
        },
        503,
      );
    }

    // -------------------------------------------------------
    // APP DATA
    // -------------------------------------------------------
    const appData: AppData = body.appData ?? {};

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
    // CALL CLAUDE
    // -------------------------------------------------------
    let anthropicResponse: Response;

    try {
      anthropicResponse = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
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
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : 'Unknown network error';

      console.error(
        'Sidekick diagnostic: Claude fetch failed:',
        details,
      );

      return jsonResponse(
        {
          error:
            `Sidekick diagnostic: Claude fetch failed: ${details}`,
        },
        502,
      );
    }

    // -------------------------------------------------------
    // READ CLAUDE RESPONSE
    // -------------------------------------------------------
    let result: AnthropicResponse;

    try {
      result = await anthropicResponse.json();
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : 'Unknown JSON parsing error';

      console.error(
        'Sidekick diagnostic: Could not read Claude response:',
        details,
      );

      return jsonResponse(
        {
          error:
            `Sidekick diagnostic: Could not read Claude response: ${details}`,
        },
        502,
      );
    }

    if (!anthropicResponse.ok) {
      const errorType =
        result.error?.type ?? '';

      const errorMessage =
        result.error?.message ?? '';

      console.error(
        'Sidekick diagnostic: Claude API error:',
        JSON.stringify(result),
      );

      return jsonResponse(
        {
          error:
            `Sidekick diagnostic: Claude returned ${anthropicResponse.status}. ${errorMessage || errorType || 'No error details returned.'}`,
        },
        anthropicResponse.status >= 400
          ? anthropicResponse.status
          : 502,
      );
    }

    // -------------------------------------------------------
    // EXTRACT TEXT
    // -------------------------------------------------------
    const reply =
      Array.isArray(result.content)
        ? result.content
            .filter(
              (item) => item?.type === 'text',
            )
            .map(
              (item) => item?.text ?? '',
            )
            .join('\n')
            .trim()
        : '';

    if (!reply) {
      console.error(
        'Sidekick diagnostic: Claude returned no text.',
        JSON.stringify(result),
      );

      return jsonResponse(
        {
          error:
            'Sidekick diagnostic: Claude returned no text.',
        },
        502,
      );
    }

    // -------------------------------------------------------
    // -------------------------------------------------------
    // The Edge Function ONLY generates the Sidekick reply.
    // The authenticated app client saves it exactly once.
    // -------------------------------------------------------
    return jsonResponse({
      reply,
    });
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : 'Unknown runtime error';

    console.error(
      'Sidekick diagnostic: Unhandled error:',
      details,
      error,
    );

    return jsonResponse(
      {
        error:
          `Sidekick diagnostic: Unhandled error: ${details}`,
      },
      500,
    );
  }
});
