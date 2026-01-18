/**
 * Neon Arcana - Debug Logger
 * Система отладочного логирования с сохранением в память
 */

export interface LogEntry {
  timestamp: number;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  category: string;
  message: string;
}

/**
 * Класс для отладочного логирования
 */
export class DebugLogger {
  private static instance: DebugLogger | null = null;
  private logs: LogEntry[] = [];
  private enabled: boolean = true;
  private maxLogs: number = 10000;

  private constructor() {}

  /**
   * Получить единственный экземпляр логгера
   */
  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  /**
   * Включить/выключить логирование
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Очистить все логи
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Добавить лог
   */
  private addLog(
    level: LogEntry["level"],
    category: string,
    message: string,
  ): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
    };

    this.logs.push(entry);

    // Ограничиваем размер
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * Лог уровня DEBUG
   */
  debug(category: string, message: string): void {
    this.addLog("DEBUG", category, message);
  }

  /**
   * Лог уровня INFO
   */
  info(category: string, message: string): void {
    this.addLog("INFO", category, message);
  }

  /**
   * Лог уровня WARN
   */
  warn(category: string, message: string): void {
    this.addLog("WARN", category, message);
  }

  /**
   * Лог уровня ERROR
   */
  error(category: string, message: string): void {
    this.addLog("ERROR", category, message);
  }

  /**
   * Получить все логи
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Получить логи по категории
   */
  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter((log) => log.category === category);
  }

  /**
   * Получить последние N логов
   */
  getLastLogs(count: number): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Экспортировать логи в текстовый формат
   */
  exportAsText(): string {
    const lines: string[] = [];
    const startTime = this.logs[0]?.timestamp ?? Date.now();

    for (const log of this.logs) {
      const relativeTime = ((log.timestamp - startTime) / 1000).toFixed(3);
      lines.push(`[${relativeTime}s] [${log.level}] [${log.category}] ${log.message}`);
    }

    return lines.join("\n");
  }

  /**
   * Экспортировать логи в JSON
   */
  exportAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Скачать логи как файл (для браузера)
   */
  downloadLogs(filename: string = "debug-logs.txt"): void {
    const content = this.exportAsText();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Глобальный экземпляр для удобства
export const logger = DebugLogger.getInstance();
