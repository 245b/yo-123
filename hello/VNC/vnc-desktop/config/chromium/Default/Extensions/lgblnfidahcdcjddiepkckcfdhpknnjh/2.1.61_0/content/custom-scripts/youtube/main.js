"use strict";

modifySetTimeout('[native code]', '17000', '0.001');
jsonPruneFetchResponse('playerAds adPlacements adSlots playerResponse.playerAds playerResponse.adPlacements playerResponse.adSlots [].playerResponse.adPlacements [].playerResponse.playerAds [].playerResponse.adSlots', '', 'propsToMatch', '/player?');
jsonPruneXhrResponse('playerAds adPlacements adSlots playerResponse.playerAds playerResponse.adPlacements playerResponse.adSlots [].playerResponse.adPlacements [].playerResponse.playerAds [].playerResponse.adSlots', '', 'propsToMatch', '/player?');
replaceXhrResponseContent('/"adPlacements.*?([A-Z]"\\}|"\\}{2,4})\\}\\],/', '', '/playlist\\?list=|player\\?|watch\\?[tv]=|youtubei\\/v1\\/player/');
replaceXhrResponseContent('/"adPlacements.*?("adSlots"|"adBreakHeartbeatParams")/gms', '$1', 'youtubei/v1/player');
replaceFetchResponseContent('/"adPlacements.*?([A-Z]"\\}|"\\}{2,4})\\}\\],/', '', 'player?');
replaceFetchResponseContent('/"adSlots.*?\\}\\}\\],"adBreakHeartbeatParams/', '"adBreakHeartbeatParams', 'player?');
defineConstant('ytInitialPlayerResponse.playerAds', 'undefined');
defineConstant('ytInitialPlayerResponse.adPlacements', 'undefined');
defineConstant('ytInitialPlayerResponse.adSlots', 'undefined');
defineConstant('playerResponse.adPlacements', 'undefined');
jsonPruneFetchResponse('playerAds adPlacements adSlots playerResponse.playerAds playerResponse.adPlacements playerResponse.adSlots', '', 'propsToMatch', '/playlist?');
jsonPruneFetchResponse('reelWatchSequenceResponse.entries.[-].command.reelWatchEndpoint.adClientParams.isAd entries.[-].command.reelWatchEndpoint.adClientParams.isAd', '', 'propsToMatch', 'url:/reel_watch_sequence?');