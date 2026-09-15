const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `
You are Sidekick, the personal AI companion inside My Sidekick.

Your job is to decide whether there is ONE genuinely useful update the user should notice right now.

Sidekick is friendly, warm, observant, calm, intelligent, practical, and personal.

Sidekick should sound like a thoughtful companion who notices what is happening in the user's life and gives useful guidance without sounding like a task manager.

IMPORTANT DATE AND TIME RULES

The current local date, current local time, and timezone are provided in the request.

You MUST use them when deciding whether an event is relevant.

Never describe something as happening "today" unless its actual date is today.

BIRTHDAYS:
- Only say a birthday is today when the birthday month and day exactly match today's month and day.
- If the birthday was yesterday, it is not today.
- If the birthday is tomorrow, it is not today.
- Never infer that a birthday is today from incomplete information.

MEETINGS, APPOINTMENTS, REMINDERS AND EVENTS:
- Only describe something as upcoming if it is actually in the future relative to the current local time.
- If an event happened earlier today, it is not upcoming.
- If a meeting was at 9:00 AM and the current time is 4:00 PM, do not say the meeting is coming up.
- If something has already passed, ignore it unless the data clearly shows it is now overdue or still requires action.
- If something is happening right now, it may be mentioned as happening now.
- Never invent dates or times.

FIRST-TIME USERS

If this is a first-time user who has completed the onboarding tour and there is not enough meaningful information in their modules yet, give a warm onboarding message.

The message should communicate the idea:

"I don't have enough information about your life yet. Fill out a few of your modules and I'll have more useful things to notice, remind you about, and guide you on."

Do not pressure the user to fill everything out.

Do not make it sound like an error.

Do not list every module.

Keep it friendly and encouraging.

Only use this message when the APP DATA supports that the user is new, has completed the tour, and genuinely does not have enough meaningful module information yet.

If the user has already populated their modules with meaningful information, do not use the first-time message.

WHEN EVERYTHING IS COMPLETE

If the user has meaningful information across their modules and there are no meaningful overdue items, pending actions, upcoming relevant events, or other useful observations, Sidekick may give a positive "you're on top of things" style update.

The tone should be warm and natural.

The message should feel like:

"You're pretty on top of things right now. Nothing important is asking for your attention, so enjoy the breathing room."

Do not copy that exact wording every time.

Do not manufacture an action simply because there is no update.

GENERAL PRIORITIES

Prioritize roughly in this order:

1. Time-sensitive or overdue things that could reasonably matter.
2. Bills, splits, reminders, deadlines, or obligations needing attention.
3. Important things the user appears to be overlooking.
4. Genuinely upcoming events.
5. Meaningful changes or patterns across habits, finances, plants, wellbeing, planner, lists, reminders, bookmarks, or other modules.
6. Positive progress worth noticing.
7. If everything is genuinely handled, a short encouraging observation.

Do not simply summarize every module.

Do not repeat an update already shown unless the underlying situation has materially changed.

Only use information actually provided in APP DATA and RECENT SIDEKICK UPDATES.

Never invent user data.

Treat RECENT SIDEKICK UPDATES as a history of what Sidekick has already brought to the user's attention.

Compare previous updates with current APP DATA.

If a previous update contained an action and the current APP DATA shows that action has been completed, do not repeat the completed action.

Look for the next genuinely useful action or observation instead.

If there is another meaningful action, surface that action.

If there is nothing meaningful to act on and the user is not in the first-time onboarding state, a positive "you're on top of things" message is appropriate when the APP DATA supports that conclusion.

Otherwise return exactly:

NO_UPDATE

NO_UPDATE IS AN INTERNAL CONTROL VALUE ONLY.

It must NEVER be shown to the user as a subtitle, label, message, or visible text.

If an update is warranted, return ONLY the update text.

Do not include:
- a title
- a subtitle
- bullets
- numbering
- emoji
- markdown
- labels
- "Sidekick:"
- "Update:"
- the words NO_UPDATE

Keep every update to a maximum of 2 sentences and about 35 words when possible.
It must fit comfortably inside a small mobile briefing card without clipping.

Prefer one concise paragraph.

Use natural sentences rather than lists.

Avoid em dashes entirely.

Never use the character "—".

Use commas, periods, or other natural punctuation.

When a specific item needs attention, be concrete and conversational.

Example:

"Your plant Montserrat hasn't been watered since September 9th, that's 5 days ago, and it's due every 2 days. It's probably thirsty by now. A quick watering today would help it bounce back."

Positive updates should feel encouraging and grounded in what the user has actually done.

Never create urgency where none exists.

Never fabricate a problem just to produce an update.
`;

type AppData = Record<string, unknown>;

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

function getDayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getLocalDateTime(timeZone?: string | null) {
  const now = new Date();

  if (!timeZone) {
    return {
      iso: now.toISOString(),
      date: getDayKey(now),
      time: now.toTimeString().slice(0, 8),
      timeZone: 'UTC',
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const values: Record<string, string> = {};

    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    const date =
      `${values.year}-${values.month}-${values.day}`;

    const time =
      `${values.hour}:${values.minute}:${values.second}`;

    return {
      iso: now.toISOString(),
      date,
      time,
      timeZone,
    };
  } catch {
    return {
      iso: now.toISOString(),
      date: getDayKey(now),
      time: now.toTimeString().slice(0, 8),
      timeZone: 'UTC',
    };
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);

  const hash = await crypto.subtle.digest(
    'SHA-256',
    bytes,
  );

  return Array.from(new Uint8Array(hash))
    .map((byte) =>
      byte.toString(16).padStart(2, '0')
    )
    .join('');
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
      { error: 'Method not allowed' },
      405,
    );
  }

  try {
    const supabaseUrl =
      Deno.env.get('SUPABASE_URL');

    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY');

    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const anthropicKey =
      Deno.env.get('ANTHROPIC_API_KEY');

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      return jsonResponse(
        {
          error:
            'Sidekick briefing: Supabase environment is incomplete.',
        },
        503,
      );
    }

    if (!anthropicKey) {
      return jsonResponse(
        {
          error:
            'Sidekick briefing: ANTHROPIC_API_KEY is missing.',
        },
        503,
      );
    }

    const authHeader =
      req.headers.get('Authorization');

    if (!authHeader) {
      return jsonResponse(
        { error: 'Authentication required.' },
        401,
      );
    }

    /*
     * IMPORTANT:
     * Keep this as a bare import.
     *
     * deno.json maps it to:
     * npm:@supabase/supabase-js@2
     *
     * Do not put npm:, jsr:, or https:
     * inside this import.
     */
    const { createClient } =
      await import('@supabase/supabase-js');

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (userError || !user) {
      console.error(
        'SIDEKICK BRIEFING AUTH ERROR:',
        userError,
      );

      return jsonResponse(
        {
          error:
            'Could not verify your account.',
        },
        401,
      );
    }

    const body = await req
      .json()
      .catch(() => ({}));

    const appData: AppData =
      body?.appData ?? {};

    const timeZone =
      typeof body?.timeZone === 'string'
        ? body.timeZone
        : typeof appData?.timezone === 'string'
          ? String(appData.timezone)
          : null;

    const localNow =
      getLocalDateTime(timeZone);

    const requestedDayKey =
      typeof body?.dayKey === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        body.dayKey,
      )
        ? body.dayKey
        : localNow.date;

    const dayKey = requestedDayKey;

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    /*
     * Hard daily cap:
     * never create more than 20 updates
     * for one user on one local calendar day.
     */
    const {
      count: updateCount,
      error: countError,
    } = await admin
      .from('sidekick_updates')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('user_id', user.id)
      .eq('day_key', dayKey);

    if (countError) {
      console.error(
        'SIDEKICK BRIEFING COUNT ERROR:',
        countError,
      );

      return jsonResponse(
        {
          error:
            'Could not check Sidekick update limit.',
        },
        500,
      );
    }

    if ((updateCount ?? 0) >= 5) {
      return jsonResponse({
        update: null,
        reason: 'daily_limit',
      });
    }

    /*
     * Load a small recent history so Sidekick can avoid
     * repeating itself without sending unnecessary tokens.
     */
    const {
      data: recentUpdates,
      error: recentError,
    } = await admin
      .from('sidekick_updates')
      .select(
        'content, source_module, priority, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(5);

    if (recentError) {
      console.error(
        'SIDEKICK BRIEFING HISTORY ERROR:',
        recentError,
      );

      return jsonResponse(
        {
          error:
            'Could not load recent Sidekick updates.',
        },
        500,
      );
    }

    /*
     * Ignore malformed historical rows so they cannot
     * waste context or appear in the briefing history.
     */
    const cleanRecentUpdates =
      (recentUpdates ?? []).filter((item) => {
        const content =
          typeof item?.content === 'string'
            ? item.content.trim()
            : '';

        return (
          content.length > 0 &&
          !/\\bNO_UPDATE\\b/i.test(content)
        );
      });

    /*
     * Avoid paying for repeated app-load calls.
     * A recent update means there is usually nothing
     * useful to regenerate immediately.
     */
    const mostRecentUpdate =
      cleanRecentUpdates[0]?.created_at;

    if (mostRecentUpdate) {
      const ageMs =
        Date.now() -
        new Date(mostRecentUpdate).getTime();

      if (
        Number.isFinite(ageMs) &&
        ageMs >= 0 &&
        ageMs < 60 * 60 * 1000
      ) {
        return jsonResponse({
          update: null,
          reason: 'recent_update_cooldown',
        });
      }
    }

    /*
     * Read onboarding information if supplied by the app.
     */
    const onboarding =
      appData?.onboarding &&
      typeof appData.onboarding === 'object'
        ? appData.onboarding as Record<
            string,
            unknown
          >
        : null;

    const firstLogin =
      onboarding?.isFirstLogin === true;

    const tourCompleted =
      onboarding?.tourCompleted === true;

    const prompt = `
CURRENT LOCAL DATE
${localNow.date}

CURRENT LOCAL TIME
${localNow.time}

USER TIMEZONE
${localNow.timeZone}

CURRENT UTC TIMESTAMP
${localNow.iso}

ONBOARDING STATE
isFirstLogin: ${firstLogin}
tourCompleted: ${tourCompleted}

APP DATA
${JSON.stringify(appData)}

RECENT SIDEKICK UPDATES
${JSON.stringify(cleanRecentUpdates)}

IMPORTANT:

Use the CURRENT LOCAL DATE and CURRENT LOCAL TIME above when evaluating every date-based item.

Do not call something "today" unless its date actually matches the current local date.

Do not call a meeting, appointment, reminder, or event "upcoming" if its time has already passed.

Do not mention a birthday as being today unless its month and day exactly match today's month and day.

If the user is a first-time user who has completed the tour and there is not enough meaningful module information yet, provide the friendly onboarding message described in the system instructions.

If the user has meaningful module information and everything is handled, a warm "you're on top of things" message is appropriate.

Otherwise, surface only ONE genuinely useful update.

Return only the update text or NO_UPDATE.
`;

    const anthropicResponse =
      await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
            'x-api-key':
              anthropicKey,
            'anthropic-version':
              '2023-06-01',
          },

          body: JSON.stringify({
            model:
              'claude-haiku-4-5-20251001',

            max_tokens: 120,

            system:
              SYSTEM_PROMPT,

            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        },
      );

    const result: AnthropicResponse =
      await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error(
        'SIDEKICK BRIEFING CLAUDE ERROR:',
        JSON.stringify(result),
      );

      return jsonResponse(
        {
          error:
            `Claude returned ${anthropicResponse.status}. ` +
            `${result.error?.message ?? ''}`,
        },
        anthropicResponse.status,
      );
    }

    const content =
      Array.isArray(result.content)
        ? result.content
            .filter(
              (item) =>
                item?.type === 'text',
            )
            .map(
              (item) =>
                item?.text ?? '',
            )
            .join('\n')
            .trim()
        : '';

    /*
     * NO_UPDATE is an internal control value.
     * Never expose it to the user.
     *
     * Reject the entire response if Claude includes it
     * anywhere, even alongside otherwise valid text.
     */
    if (
      !content ||
      /\bNO_UPDATE\b/i.test(content)
    ) {
      return jsonResponse({
        update: null,
        reason: 'no_update',
      });
    }

    /*
     * Clean accidental formatting from Claude.
     */
    let cleanContent =
      content
        .replace(
          /^```[\s\S]*?```$/g,
          '',
        )
        .replace(
          /^\s*(?:SIDEKICK|UPDATE):\s*/i,
          '',
        )
        .replace(
          /—/g,
          ',',
        )
        .replace(
          /\n+/g,
          ' ',
        )
        .replace(
          /\s{2,}/g,
          ' ',
        )
        .trim();

    /*
     * Hard safety net:
     * never show more than 2 sentences.
     */
    const sentences =
      cleanContent.match(
        /[^.!?]+(?:[.!?]+|$)/g,
      ) ?? [];

    cleanContent = sentences
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
      .trim();

    if (!cleanContent) {
      return jsonResponse({
        update: null,
        reason: 'no_update',
      });
    }

    const fingerprint =
      await sha256(
        cleanContent
          .toLowerCase()
          .replace(
            /\s+/g,
            ' ',
          ),
      );

    /*
     * Prevent the same update from appearing
     * twice on the same day.
     */
    const {
      data: duplicate,
    } = await admin
      .from('sidekick_updates')
      .select('id')
      .eq(
        'user_id',
        user.id,
      )
      .eq(
        'day_key',
        dayKey,
      )
      .eq(
        'fingerprint',
        fingerprint,
      )
      .maybeSingle();

    if (duplicate) {
      return jsonResponse({
        update: null,
        reason: 'duplicate',
      });
    }

    const {
      data: inserted,
      error: insertError,
    } = await admin
      .from('sidekick_updates')
      .insert({
        user_id: user.id,
        day_key: dayKey,
        content: cleanContent,
        source_module: null,
        priority: 0,
        fingerprint,
        shown_at:
          new Date().toISOString(),
      })
      .select(
        'id, content, source_module, priority, created_at, shown_at',
      )
      .single();

    if (
      insertError ||
      !inserted
    ) {
      console.error(
        'SIDEKICK BRIEFING INSERT ERROR:',
        insertError,
      );

      return jsonResponse(
        {
          error:
            'Could not save the Sidekick update.',
        },
        500,
      );
    }

    return jsonResponse({
      update: inserted,
    });
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : 'Unknown runtime error';

    console.error(
      'SIDEKICK BRIEFING UNHANDLED ERROR:',
      details,
      error,
    );

    return jsonResponse(
      {
        error:
          `Sidekick briefing error: ${details}`,
      },
      500,
    );
  }
});