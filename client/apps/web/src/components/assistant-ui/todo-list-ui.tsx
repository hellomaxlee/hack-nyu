import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckCircle2, Circle, Clock } from "lucide-react";

interface Todo {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  priority: number;
  createdAt: string;
}

interface TodoListResult {
  todos: Todo[];
  summary: string;
}

export const TodoListUI: ToolCallMessagePartComponent = ({ result }) => {
  if (!result || typeof result !== "object") return null;

  const { todos, summary } = result as TodoListResult;

  const getStatusIcon = (status: Todo["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="size-5 text-green-600" />;
      case "in_progress":
        return <Clock className="size-5 text-blue-600" />;
      case "pending":
        return <Circle className="size-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: Todo["status"]) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "in_progress":
        return "In Progress";
      case "pending":
        return "Pending";
    }
  };

  const getStatusColor = (status: Todo["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800";
      case "in_progress":
        return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800";
      case "pending":
        return "bg-muted border-border";
    }
  };

  return (
    <div className="aui-todo-list-root my-4 flex w-full flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="aui-todo-list-header flex items-center justify-between border-b pb-3">
        <h3 className="text-lg font-semibold">Search Strategy</h3>
      </div>

      <div className="aui-todo-list-items flex flex-col gap-2">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className={`aui-todo-item flex gap-3 rounded-md border p-3 transition-colors ${getStatusColor(
              todo.status
            )}`}
          >
            <div className="aui-todo-icon flex-shrink-0 pt-0.5">
              {getStatusIcon(todo.status)}
            </div>
            <div className="aui-todo-content flex-1 min-w-0">
              <div className="aui-todo-header flex items-start justify-between gap-2">
                <h4
                  className={`text-sm font-medium ${todo.status === "completed"
                    ? "line-through text-muted-foreground"
                    : ""
                    }`}
                >
                  {todo.title}
                </h4>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {todo.description}
              </p>
              <div className="aui-todo-footer mt-2 flex items-center gap-2">
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
