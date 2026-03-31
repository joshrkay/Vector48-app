"use client";

import { useCallback, useEffect, useState } from "react";

import {
  envTableRows,
  LAUNCH_CHECKLIST_STORAGE_KEY,
  launchPhases,
  launchSummaryParagraphs,
} from "@/lib/launch-checklist/data";

import styles from "./launch-checklist.module.css";

type DoneMap = Record<string, boolean>;

export function LaunchChecklistClient() {
  const [done, setDone] = useState<DoneMap>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAUNCH_CHECKLIST_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DoneMap;
      if (parsed && typeof parsed === "object") {
        setDone(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAUNCH_CHECKLIST_STORAGE_KEY, JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [done]);

  const toggle = useCallback((id: string) => {
    setDone((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <h1 className={styles.title}>Vector 48 — Launch Checklist</h1>
        <p className={styles.subtitle}>
          Everything from &quot;prompts executed&quot; to &quot;first customer
          live.&quot; Click checkboxes as you go.
        </p>

        {launchPhases.map((phase) => (
          <section key={phase.num} className={styles.phase}>
            <div className={styles.phaseHeader}>
              <div className={styles.phaseNum}>{phase.num}</div>
              <div className={styles.phaseTitle}>{phase.title}</div>
              <div className={styles.phaseTime}>{phase.timeLabel}</div>
            </div>

            {phase.num === 5 ? (
              <table className={styles.envTable}>
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Where</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {envTableRows.map((row) => (
                    <tr key={row.variable}>
                      <td className={styles.envVar}>{row.variable}</td>
                      <td>{row.where}</td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <ul className={styles.taskList}>
                {phase.tasks.map((task) => {
                  const isDone = Boolean(done[task.id]);
                  return (
                    <li
                      key={task.id}
                      className={
                        isDone
                          ? `${styles.taskItem} ${styles.taskItemDone}`
                          : styles.taskItem
                      }
                    >
                      <button
                        type="button"
                        className={styles.check}
                        onClick={() => toggle(task.id)}
                        aria-pressed={isDone}
                        aria-label={isDone ? "Mark incomplete" : "Mark done"}
                      >
                        <span className={styles.checkMark} aria-hidden>
                          ✓
                        </span>
                      </button>
                      <span className={styles.taskText}>
                        {task.boldLead ? (
                          <>
                            <strong className={styles.boldLead}>
                              {task.boldLead}
                            </strong>
                            {task.text}
                          </>
                        ) : (
                          task.text
                        )}
                        {task.dep ? (
                          <span className={styles.dep}>{task.dep}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        <div className={styles.summary}>
          <h3 className={styles.summaryTitle}>Total Estimated Timeline</h3>
          {launchSummaryParagraphs.map((p, i) => (
            <p
              key={p.lead}
              className={
                i === 0 ? styles.summaryP : `${styles.summaryP} ${styles.summaryPSpaced}`
              }
            >
              <strong>{p.lead}</strong>
              {p.body}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
