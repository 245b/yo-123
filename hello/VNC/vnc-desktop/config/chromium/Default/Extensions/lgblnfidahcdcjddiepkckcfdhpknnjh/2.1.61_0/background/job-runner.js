"use strict";

class JobRunner {
  jobs = {};
  onAlarm({
    name
  }) {
    this.jobs[name]?.();
  }
  addJob(name, func, periodInMinutes) {
    browser.alarms.get(name).then(alarm => {
      if (!alarm || alarm.periodInMinutes !== periodInMinutes) {
        browser.alarms.create(name, {
          periodInMinutes
        });
      }
    });
    this.jobs[name] = func;
  }
}
const jobRunner = new JobRunner();
function createAllJobs() {
  jobRunner.addJob('reset-icon-badge', updateIcon, 10);
  jobRunner.addJob('heartbeat', heartbeat, 60);
  jobRunner.addJob('cleanup-tabs', tab.cleanupTabs.bind(tab), 30);
  jobRunner.addJob('get-matched-rules', countMatchedRules, 1);
}