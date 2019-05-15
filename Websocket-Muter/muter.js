console.log("Chrome:", chrome);
function mute(tab)
{
	if (tab.audible && !tab.mutedInfo.muted)
	{
		console.log("Noisy tab:", tab);
		chrome.tabs.update(tab.id, {"muted": true});
	}
}
function unmute(tab)
{
	if (tab.mutedInfo.muted &&
		tab.mutedInfo.reason === "extension" &&
		tab.mutedInfo.extensionId === chrome.runtime.id)
	{
		console.log("Muted tab:", tab);
		chrome.tabs.update(tab.id, {"muted": false});
	}
}
function manage(f)
{
	chrome.tabs.query({}, tabs => tabs.forEach(f));
}
