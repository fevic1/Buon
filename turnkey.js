import { ApiKeyStamper } from "https://cdn.jsdelivr.net/npm/@turnkey/api-key-stamper/+esm";
import { TurnkeyClient } from "https://cdn.jsdelivr.net/npm/@turnkey/http/+esm";

function keys() {
  return window.BUON_KEYS || {
    org: localStorage.getItem("buon_tkOrg") || "",
    pub: localStorage.getItem("buon_tkPub") || "",
    priv: localStorage.getItem("buon_tkPriv") || "",
    wallet: localStorage.getItem("buon_tkWallet") || ""
  };
}

async function whoami() {
  var k = keys();
  if (!k.org || !k.pub || !k.priv) {
    if (typeof log === "function") log("Turnkey keys not saved yet");
    return null;
  }
  var stamper = new ApiKeyStamper({ apiPublicKey: k.pub, apiPrivateKey: k.priv });
  var client = new TurnkeyClient({ baseUrl: "https://api.turnkey.com" }, stamper);
  var me = await client.getWhoami({ organizationId: k.org });
  window.BUON_TK = { client: client, me: me, org: k.org };
  if (typeof log === "function") log("Turnkey ok · " + (me.username || me.organizationName || me.organizationId));
  var bot = document.getElementById("botStatus");
  if (bot) bot.textContent = "turnkey on";
  return me;
}

window.testTurnkey = whoami;
whoami().catch(function (err) {
  if (typeof log === "function") log("Turnkey: " + (err.message || err));
  var bot = document.getElementById("botStatus");
  if (bot) bot.textContent = "turnkey fail";
});
