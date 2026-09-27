import { createServer } from "http";
import { tavily } from "@tavily/core";
import OpenAI from "openai";
import NodeCache from "node-cache";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
const cache = new NodeCache({ stdTTL: 60 * 60 * 24 });

const expenseDb = [];
const modelName = "openai/gpt-oss-20b";
const maxToolRounds = 10;

const expenseTools = [
    {
        type: "function",
        function: {
            name: "getTotalExpenses",
            description: "Get the total expenses from date to date",
            parameters: {
                type: "object",
                properties: {
                    from: { type: "string", description: "The start date of expense" },
                    to: { type: "string", description: "The end date of expense" },
                },
                required: ["from", "to"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "addExpense",
            description: "Add a new expense",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "The name of the expense" },
                    amount: { type: "number", description: "The amount of the expense" },
                },
                required: ["name", "amount"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "webSearch",
            description: "Search the web for information",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query" },
                },
                required: ["query"],
            },
        },
    },
];

const functionMap = {
    getTotalExpenses,
    addExpense,
    webSearch,
};

function buildSystemPrompt() {
    return `You are Josh, a personal finance assistant.
Your task is to assist users with their expenses, savings, and investment goals.
Provide personalized advice based on the user's financial situation and goals.
The currency is PKR.
You have access to getTotalExpenses({ from, to }), addExpense({ name, amount }), and webSearch({ query }).
Current date: ${new Date().toISOString()}`;
}

async function callAgent(prompt, threadId) {
    const messages = cache.get(threadId) ?? [{ role: "system", content: buildSystemPrompt() }];
    messages.push({ role: "user", content: prompt });

    let toolRoundCount = 0;

    while (toolRoundCount < maxToolRounds) {
        const response = await groqClient.chat.completions.create({
            model: modelName,
            messages,
            tool_choice: "auto",
            tools: expenseTools,
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        if (!assistantMessage.tool_calls?.length) {
            cache.set(threadId, messages);
            return assistantMessage.content ?? "";
        }

        for (const toolCall of assistantMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionToCall = functionMap[functionName];

            if (!functionToCall) {
                messages.push({
                    role: "tool",
                    content: `Unknown tool: ${functionName}`,
                    tool_call_id: toolCall.id,
                });
                continue;
            }

            const functionArgs = JSON.parse(toolCall.function.arguments);
            const result = await functionToCall(functionArgs);
            messages.push({
                role: "tool",
                content: String(result),
                tool_call_id: toolCall.id,
            });
        }

        toolRoundCount += 1;
    }

    return "I couldn't find a satisfactory answer after multiple attempts. Please try rephrasing your question.";
}

function getTotalExpenses({ from, to }) {
    const total = expenseDb.reduce((sum, expense) => sum + expense.amount, 0);
    return String(total);
}

function addExpense({ name, amount }) {
    expenseDb.push({ name, amount });
    return "Added to the database.";
}

async function webSearch({ query }) {
    const result = await tavilyClient.search(query, { searchDepth: "advanced" });
    return result.results.map((item) => item.content).join("\n\n");
}

async function readJsonBody(request) {
    let body = "";

    for await (const chunk of request) {
        body += chunk;

        if (body.length > 1_000_000) {
            throw new Error("Request body is too large.");
        }
    }

    return JSON.parse(body);
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/prompt") {
        sendJson(response, 404, { error: "Not found" });
        return;
    }

    try {
        const body = await readJsonBody(request);

        if (
            typeof body?.threadId !== "string" ||
            !body.threadId.trim() ||
            typeof body.prompt !== "string" ||
            !body.prompt.trim()
        ) {
            sendJson(response, 400, {
                error: "Non-empty threadId and prompt strings are required.",
            });
            return;
        }

        const answer = await callAgent(body.prompt.trim(), body.threadId.trim());
        sendJson(response, 200, { response: answer });
    } catch (error) {
        const statusCode = error instanceof SyntaxError ? 400 : 500;
        const message = statusCode === 400 ? "Invalid JSON body." : "Agent request failed.";

        sendJson(response, statusCode, { error: message });

        if (statusCode === 500) {
            console.error(error);
        }
    }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
    console.log(`REST agent listening on http://localhost:${port}`);
});