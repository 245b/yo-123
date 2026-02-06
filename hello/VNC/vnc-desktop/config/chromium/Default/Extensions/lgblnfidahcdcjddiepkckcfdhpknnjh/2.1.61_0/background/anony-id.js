"use strict";

async function loadAnonyId() {
  const anonyReportKey = 'anonyReportObjectKey';
  const value = await storageService.get(anonyReportKey);
  if (value) {
    return value.id;
  }
  const newValue = {
    id: crypto.randomUUID()
  };
  await storageService.set(anonyReportKey, newValue);
  return newValue.id;
}