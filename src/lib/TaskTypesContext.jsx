import { createContext, useContext } from "react";
import { DEFAULT_TYPE_STYLE } from "../data/tasks";

const TaskTypesContext = createContext({});

export function TaskTypesProvider({ value, children }) {
  return <TaskTypesContext.Provider value={value}>{children}</TaskTypesContext.Provider>;
}

export function useTaskTypes() {
  return useContext(TaskTypesContext);
}

export function useTaskTypeStyle(type) {
  const taskTypes = useContext(TaskTypesContext);
  return taskTypes[type] || DEFAULT_TYPE_STYLE;
}
