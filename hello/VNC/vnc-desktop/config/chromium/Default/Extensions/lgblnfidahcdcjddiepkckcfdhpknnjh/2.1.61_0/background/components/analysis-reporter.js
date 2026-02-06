"use strict";

class AnalysisReporter {
  container = new DataContainer('anonyReportBulk', {
    bulk: [],
    errorAmount: 0
  });
  async addReportsBulk(reportData) {
    const data = await this.container.get();
    await this.container.set({
      ...data,
      bulk: [...data.bulk, ...reportData]
    });
    await this.reportBulk();
  }
  async reportBulk(sendImmediately = false) {
    const hasConsent = await dataProcessingConsent.getConsent();
    if (!hasConsent) {
      return;
    }
    const data = await this.container.get();
    if (data.bulk.length >= 10 || data.bulk.length && sendImmediately) {
      const reports = data.bulk.splice(0, 10);
      await this.container.set({
        ...data,
        bulk: data.bulk
      });
      await this.sendAnonyReportToServer(reports);
    }
  }
  async sendAnonyReportToServer(reportData) {
    try {
      const [nid, os, cc] = await Promise.all([loadAnonyId(), getOperatingSystem(), userData.getGeo()]);
      const rows = reportData.map(r => ({
        nid,
        pid: '',
        sid: '',
        cc,
        ts: r.loadTime,
        rfu: encodeURIComponent(r.previousUrl),
        tu: encodeURIComponent(r.pageUrl),
        trt: r.trt || '',
        trq: r.trq?.join(',') || '',
        os,
        ver: getAppVersion(),
        blk: reportData.length
      }));
      const {
        error
      } = await serverApi.callUrl({
        url: API_URLS.reportUrl,
        method: 'POST',
        data: {
          rows
        }
      });
      if (error) {
        throw error;
      }
      const data = await this.container.get();
      await this.container.set({
        ...data,
        errorAmount: 0
      });
    } catch (e) {
      const data = await this.container.get();
      let newErrorAmount = (data.errorAmount || 0) + 1;
      if (newErrorAmount === 10) {
        newErrorAmount = 0;
        serverLogger.logError(e, 'AnalysisReporter.sendAnonyReportToServer', true);
      }
      await this.container.set({
        bulk: [...data.bulk, ...reportData],
        errorAmount: newErrorAmount
      });
    }
  }
}
const analysisReporter = new AnalysisReporter();