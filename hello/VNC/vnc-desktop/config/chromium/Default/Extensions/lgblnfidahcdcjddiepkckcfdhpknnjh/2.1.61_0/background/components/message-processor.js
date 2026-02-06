"use strict";

class MessageProcessor {
  actionInCase = {
    [MESSAGE_TYPES.addCustomCssByHost]: actionInCaseAddCustomCssByHost,
    [MESSAGE_TYPES.blockElement]: actionInCaseBlockElement,
    [MESSAGE_TYPES.countBlockedElementsRequest]: actionInCaseCountBlockedElements,
    [MESSAGE_TYPES.extensionUrlOpened]: actionInCaseExtensionUrlOpened,
    [MESSAGE_TYPES.getAppDataRequest]: actionInCaseGetAppData,
    [MESSAGE_TYPES.getBlockingDataRequest]: actionInCaseGetBlockingData,
    [MESSAGE_TYPES.getDataProcessingConsentRequest]: actionInCaseGetDataProcessingConsent,
    [MESSAGE_TYPES.getPageDataForContentRequest]: actionInCaseGetPageDataForContent,
    [MESSAGE_TYPES.getUserSettingsRequest]: actionInCaseGetUserSettings,
    [MESSAGE_TYPES.openSettingsPage]: actionInCaseOpenSettingsPage,
    [MESSAGE_TYPES.popupUserAction]: actionInCasePopupUserAction,
    [MESSAGE_TYPES.sendEmail]: actionInCaseSendEmail,
    [MESSAGE_TYPES.setDataProcessingConsent]: actionInCaseSetDataProcessingConsent,
    [MESSAGE_TYPES.toggleSiteInListRequest]: actionInCaseToggleSiteInList,
    [MESSAGE_TYPES.undoBlockedElementsRequest]: actionInCaseUndoBlockedElements,
    [MESSAGE_TYPES.updateStatistics]: actionInCaseUpdateStatistics,
    [MESSAGE_TYPES.updateUserSettingsRequest]: actionInCaseUpdateUserSettings,
    [MESSAGE_TYPES.filteringUrlActionRequest]: actionInCaseFilteringUrlAction
  };
  async sendMessage(request, sender) {
    debug.log(`[MessageProcessor] Message received ${request.type}`, request);
    const result = await this.actionInCase[request.type]?.(request, sender);
    return result ?? true;
  }
}
const messageProcessor = new MessageProcessor();