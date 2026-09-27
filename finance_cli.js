import OpenAI from "openai";
import readline from "readline/promises";
import { tavily } from "@tavily/core";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const expenseDb = [];
const modelName = "openai/gpt-oss-20b";

const expenseTools = [
    {
        type: "function",
        function: {
            name: "getTotalExpenses",
            description: "Get the total expenses from date to date",
            parameters: {
                type: "object",
                properties: {
                    from: {
                        type: "string",
                        description: "The start date of the expense range",
                    },
                    to: {
                        type: "string",
                        description: "The end date of the expense range",
                    },
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
                    name: {
                        type: "string",
                        description: "The name of the expense",
                    },
                    amount: {
                        type: "number",
                        description: "The amount of the expense",
                    },
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
                    query: {
                        type: "string",
                        description: "The search query",
                    },
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
You have access to the following tools:
1. getTotalExpenses({ from, to })
2. addExpense({ name, amount })
3. webSearch({ query })
Current date: ${new Date().toISOString()}`;
}

async function callAgent() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const messages = [{ role: "system", content: buildSystemPrompt() }];

    while (true) {
        const question = await rl.question("User: ");

        if (question.toLowerCase() === "exit") {
            console.log("Exiting...");
            rl.close();
            break;
        }

        messages.push({ role: "user", content: question });

        while (true) {
            const response = await groqClient.chat.completions.create({
                model: modelName,
                messages,
                tool_choice: "auto",
                tools: expenseTools,
            });

            const assistantMessage = response.choices[0].message;
            messages.push(assistantMessage);

            const toolCalls = assistantMessage.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                console.log(`Assistant: ${assistantMessage.content ?? ""}`);
                break;
            }

            for (const toolCall of toolCalls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                const supportedFunction = functionMap[functionName];

                if (!supportedFunction) {
                    continue;
                }

                const result = await supportedFunction(functionArgs);
                messages.push({
                    role: "tool",
                    content: String(result),
                    tool_call_id: toolCall.id,
                });
            }
        }
    }
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

callAgent();