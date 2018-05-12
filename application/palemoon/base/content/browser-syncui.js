# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

// gSyncUI handles updating the tools menu
var gSyncUI = {
  _obs: ["weave:service:sync:start",
         "weave:service:sync:delayed",
         "weave:service:quota:remaining",
         "weave:service:setup-complete",
         "weave:service:login:start",
         "weave:service:login:finish",
         "weave:service:login:error",
         "weave:service:logout:finish",
         "weave:service:start-over",
         "weave:ui:login:error",
         "weave:ui:sync:error",
         "weave:ui:sync:finish",
         "weave:ui:clear-error",
  ],

  _unloaded: false,

  init: function SUI_init() {
    // Proceed to set up the UI if Sync has already started up.
    // Otherwise we'll do it when Sync is firing up.
    let xps = Components.classes["@mozilla.org/weave/service;1"]
                                .getService(Components.interfaces.nsISupports)
                                .wrappedJSObject;
    if (xps.ready) {
      this.initUI();
      return;
    }

    Services.obs.addObserver(this, "weave:service:ready", true);

    // Remove the observer if the window is closed before the observer
    // was triggered.
    window.addEventListener("unload", function onUnload() {
      gSyncUI._unloaded = true;
      window.removeEventListener("unload", onUnload, false);
      Services.obs.removeObserver(gSyncUI, "weave:service:ready");

      if (Weave.Status.ready) {
        gSyncUI._obs.forEach(function(topic) {
          Services.obs.removeObserver(gSyncUI, topic);
        });
      }
    }, false);
  },

  initUI: function SUI_initUI() {
    // If this is a browser window?
    if (gBrowser) {
      this._obs.push("weave:notification:added");
    }

    this._obs.forEach(function(topic) {
      Services.obs.addObserver(this, topic, true);
    }, this);

    this.updateUI();
  },

  _wasDelayed: false,

  _needsSetup: function SUI__needsSetup() {
    let firstSync = "";
    try {
      firstSync = Services.prefs.getCharPref("services.sync.firstSync");
    } catch (e) { }
    return Weave.Status.checkSetup() == Weave.CLIENT_NOT_CONFIGURED ||
           firstSync == "notReady";
  },

  updateUI: function SUI_updateUI() {
    let needsSetup = this._needsSetup();
    document.getElementById("sync-setup-state").hidden = !needsSetup;
    document.getElementById("sync-syncnow-state").hidden = needsSetup;

    if (!gBrowser)
      return;

    let button = document.getElementById("sync-button");
    if (!button)
      return;

    button.removeAttribute("status");
    this._updateLastSyncTime();
    if (needsSetup)
      button.removeAttribute("tooltiptext");
  },


  // Functions called by observers
  onActivityStart: function SUI_onActivityStart() {
    if (!gBrowser)
      return;

    let button = document.getElementById("sync-button");
    if (!button)
      return;

    button.setAttribute("status", "active");
  },

  onSyncDelay: function SUI_onSyncDelay() {
    let nb = window.document.getElementById("global-notificationbox");

    // basically, we want to just inform users that stuff is going to take a while
    let title = this._stringBundle.GetStringFromName("error.sync.no_node_found.title");
    let description = this._stringBundle.GetStringFromName("error.sync.no_node_found");
    let buttons = [{
      label: this._stringBundle.GetStringFromName(
          "error.sync.serverStatusButton.label"),
      accessKey: this._stringBundle.GetStringFromName(
          "error.sync.serverStatusButton.accesskey"),
      callback: function() {
        gSyncUI.openServerStatus();
        return true;
      }
    }];

    let fragment = document.createDocumentFragment();
    let msgNode = document.createTextNode(description);
    fragment.appendChild(msgNode);

    nb.appendNotification(fragment,
                          title,
                          undefined,
                          nb.PRIORITY_INFO,
                          buttons);
    this._wasDelayed = true;
  },

  onLoginFinish: function SUI_onLoginFinish() {
    // Clear out any login failure notifications
    let title = this._stringBundle.GetStringFromName("error.login.title");
    this.clearError(title);
  },

  onSetupComplete: function SUI_onSetupComplete() {
    this.onLoginFinish();
  },

  onLoginError: function SUI_onLoginError() {
    // if we haven't set up the client, don't show errors
    if (this._needsSetup()) {
      this.updateUI();
      return;
    }

    let nb = window.document.getElementById("global-notificationbox");

    let title = this._stringBundle.GetStringFromName("error.login.title");

    let description;
    if (Weave.Status.sync == Weave.PROLONGED_SYNC_FAILURE) {
      // Convert to days
      let lastSync =
        Services.prefs.getIntPref("services.sync.errorhandler.networkFailureReportTimeout") / 86400;
      description =
        this._stringBundle.formatStringFromName("error.sync.prolonged_failure", [lastSync], 1);
    } else {
      let reason = Weave.Utils.getErrorString(Weave.Status.login);
      description =
        this._stringBundle.formatStringFromName("error.sync.description", [reason], 1);
    }

    let buttons = [];
    buttons.push({
      label: this._stringBundle.GetStringFromName(
          "error.login.prefs.label"),
      accessKey: this._stringBundle.GetStringFromName(
          "error.login.prefs.accesskey"),
      callback: function() {
        gSyncUI.openPrefs();
        return true;
      }
    });

    let fragment = document.createDocumentFragment();
    let msgNode = document.createTextNode(description);
    fragment.appendChild(msgNode);

    nb.appendNotification(fragment,
                          title,
                          undefined,
                          nb.PRIORITY_WARNING,
                          buttons);
    this.updateUI();
  },

  onLogout: function SUI_onLogout() {
    this.updateUI();
  },

  onStartOver: function SUI_onStartOver() {
    this.clearError();
  },

  onQuotaNotice: function onQuotaNotice(subject, data) {
    let nb = window.document.getElementById("global-notificationbox");

    let title = this._stringBundle.GetStringFromName("warning.sync.quota.label");
    let description = this._stringBundle.GetStringFromName("warning.sync.quota.description");
    let buttons = [];
    buttons.push({
      label: this._stringBundle.GetStringFromName(
          "error.sync.viewQuotaButton.label"),
      accessKey: this._stringBundle.GetStringFromName(
          "error.sync.viewQuotaButton.accesskey"),
      callback: function() {
        gSyncUI.openQuotaDialog();
        return true;
      }
    });

    let fragment = document.createDocumentFragment();
    let msgNode = document.createTextNode(description);
    fragment.appendChild(msgNode);

    nb.appendNotification(fragment,
                          title,
                          undefined,
                          nb.PRIORITY_WARNING,
                          buttons);
  },

  openServerStatus: function () {
    let statusURL = Services.prefs.getCharPref("services.sync.statusURL");
    window.openUILinkIn(statusURL, "tab");
  },

  // Commands
  doSync: function SUI_doSync() {
    setTimeout(function() Weave.Service.errorHandler.syncAndReportErrors(), 0);
  },

  handleToolbarButton: function SUI_handleStatusbarButton() {
    if (this._needsSetup())
      this.openSetup();
    else
      this.doSync();
  },

  //XXXzpao should be part of syncCommon.js - which we might want to make a module...
  //        To be fixed in a followup (bug 583366)

  /**
   * Invoke the Sync setup wizard.
   *
   * @param wizardType
   *        Indicates type of wizard to launch:
   *          null    -- regular set up wizard
   *          "pair"  -- pair a device first
   *          "reset" -- reset sync
   */

  openSetup: function SUI_openSetup(wizardType) {
    let win = Services.wm.getMostRecentWindow("Weave:AccountSetup");
    if (win)
      win.focus();
    else {
      window.openDialog("chrome://browser/content/sync/setup.xul",
                        "weaveSetup", "centerscreen,chrome,resizable=no",
                        wizardType);
    }
  },

  openAddDevice: function () {
    if (!Weave.Utils.ensureMPUnlocked())
      return;

    let win = Services.wm.getMostRecentWindow("Sync:AddDevice");
    if (win)
      win.focus();
    else
      window.openDialog("chrome://browser/content/sync/addDevice.xul",
                        "syncAddDevice", "centerscreen,chrome,resizable=no");
  },

  openQuotaDialog: function SUI_openQuotaDialog() {
    let win = Services.wm.getMostRecentWindow("Sync:ViewQuota");
    if (win)
      win.focus();
    else
      Services.ww.activeWindow.openDialog(
        "chrome://browser/content/sync/quota.xul", "",
        "centerscreen,chrome,dialog,modal");
  },

  openPrefs: function SUI_openPrefs() {
    openPreferences("paneSync");
  },


  // Helpers
  _updateLastSyncTime: function SUI__updateLastSyncTime() {
    if (!gBrowser)
      return;

    let syncButton = document.getElementById("sync-button");
    if (!syncButton)
      return;

    let lastSync;
    try {
      lastSync = Services.prefs.getCharPref("services.sync.lastSync");
    }
    catch (e) { };
    if (!lastSync || this._needsSetup()) {
      syncButton.removeAttribute("tooltiptext");
      return;
    }

    // Show the day-of-week and time (HH:MM) of last sync
    let lastSyncDate = new Date(lastSync).toLocaleDateString(undefined,
        {weekday: 'long', hour: 'numeric', minute: 'numeric'});
    let lastSyncLabel =
      this._stringBundle.formatStringFromName("lastSync2.label", [lastSyncDate], 1);

    syncButton.setAttribute("tooltiptext", lastSyncLabel);
  },

  clearError: function SUI_clearError(errorString) {
    let nb = window.document.getElementById("global-notificationbox");
    let n = nb.getNotificationWithValue(errorString);
    if (n) {
      nb.removeNotification(n, true);
    }
    this.updateUI();
  },

  onSyncFinish: function SUI_onSyncFinish() {
    let title = this._stringBundle.GetStringFromName("error.sync.title");

    // Clear out sync failures on a successful sync
    this.clearError(title);

    if (this._wasDelayed && Weave.Status.sync != Weave.NO_SYNC_NODE_FOUND) {
      title = this._stringBundle.GetStringFromName("error.sync.no_node_found.title");
      this.clearError(title);
      this._wasDelayed = false;
    }
  },

  onSyncError: function SUI_onSyncError() {
    let nb = window.document.getElementById("global-notificationbox");

    let title = this._stringBundle.GetStringFromName("error.sync.title");

    if (Weave.Status.login != Weave.LOGIN_SUCCEEDED) {
      this.onLoginError();
      return;
    }

    let description;
    if (Weave.Status.sync == Weave.PROLONGED_SYNC_FAILURE) {
      // Convert to days
      let lastSync =
        Services.prefs.getIntPref("services.sync.errorhandler.networkFailureReportTimeout") / 86400;
      description =
        this._stringBundle.formatStringFromName("error.sync.prolonged_failure", [lastSync], 1);
    } else {
      let error = Weave.Utils.getErrorString(Weave.Status.sync);
      description =
        this._stringBundle.formatStringFromName("error.sync.description", [error], 1);
    }
    let priority = nb.PRIORITY_WARNING;
    let buttons = [];

    // Check if the client is outdated in some way
    let outdated = Weave.Status.sync == Weave.VERSION_OUT_OF_DATE;
    for (let [engine, reason] in Iterator(Weave.Status.engines))
      outdated = outdated || reason == Weave.VERSION_OUT_OF_DATE;

    if (outdated) {
      description = this._stringBundle.GetStringFromName(
        "error.sync.needUpdate.description");
      buttons.push({
        label: this._stringBundle.GetStringFromName(
            "error.sync.needUpdate.label"),
        accessKey: this._stringBundle.GetStringFromName(
            "error.sync.needUpdate.accesskey"),
        callback: function() {
          window.openUILinkIn(Services.prefs.getCharPref(
              "services.sync.outdated.url"), "tab");
          return true;
        }
      });
    }
    else if (Weave.Status.sync == Weave.OVER_QUOTA) {
      description = this._stringBundle.GetStringFromName(
        "error.sync.quota.description");
      buttons.push({
        label: this._stringBundle.GetStringFromName(
          "error.sync.viewQuotaButton.label"),
        accessKey: this._stringBundle.GetStringFromName(
          "error.sync.viewQuotaButton.accesskey"),
        callback: function() {
          gSyncUI.openQuotaDialog();
          return true;
        }
      });
    }
    else if (Weave.Status.enforceBackoff) {
      priority = nb.PRIORITY_INFO;
      buttons.push({
        label: this._stringBundle.GetStringFromName(
            "error.sync.serverStatusButton.label"),
        accessKey: this._stringBundle.GetStringFromName(
            "error.sync.serverStatusButton.accesskey"),
        callback: function() {
          gSyncUI.openServerStatus();
          return true;
        }
      });
    }
    else {
      priority = nb.PRIORITY_INFO;
      buttons.push({
        label: this._stringBundle.GetStringFromName(
            "error.sync.tryAgainButton.label"),
        accessKey: this._stringBundle.GetStringFromName(
            "error.sync.tryAgainButton.accesskey"),
        callback: function() {
          gSyncUI.doSync();
          return true;
        }
      });
    }

    let fragment = document.createDocumentFragment();
    let msgNode = document.createTextNode(description);
    fragment.appendChild(msgNode);
    nb.appendNotification(fragment,
                          title,
                          undefined,
                          priority,
                          buttons);

    if (this._wasDelayed && Weave.Status.sync != Weave.NO_SYNC_NODE_FOUND) {
      title = this._stringBundle.GetStringFromName("error.sync.no_node_found.title");
      let nb = window.document.getElementById("global-notificationbox");
      let n = nb.getNotificationWithValue(title);
      if (n) {
        nb.removeNotification(n, true);
      }
      this._wasDelayed = false;
    }

    this.updateUI();
  },

  observe: function SUI_observe(subject, topic, data) {
    if (this._unloaded) {
      Cu.reportError("SyncUI observer called after unload: " + topic);
      return;
    }

    switch (topic) {
      case "weave:service:sync:start":
        this.onActivityStart();
        break;
      case "weave:ui:sync:finish":
        this.onSyncFinish();
        break;
      case "weave:ui:sync:error":
        this.onSyncError();
        break;
      case "weave:service:sync:delayed":
        this.onSyncDelay();
        break;
      case "weave:service:quota:remaining":
        this.onQuotaNotice();
        break;
      case "weave:service:setup-complete":
        this.onSetupComplete();
        break;
      case "weave:service:login:start":
        this.onActivityStart();
        break;
      case "weave:service:login:finish":
        this.onLoginFinish();
        break;
      case "weave:ui:login:error":
      case "weave:service:login:error":
        this.onLoginError();
        break;
      case "weave:service:logout:finish":
        this.onLogout();
        break;
      case "weave:service:start-over":
        this.onStartOver();
        break;
      case "weave:service:ready":
        this.initUI();
        break;
    }
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIObserver,
    Ci.nsISupportsWeakReference
  ])
};

XPCOMUtils.defineLazyGetter(gSyncUI, "_stringBundle", function() {
  //XXXzpao these strings should probably be moved from /services to /browser... (bug 583381)
  //        but for now just make it work
  return Cc["@mozilla.org/intl/stringbundle;1"].
         getService(Ci.nsIStringBundleService).
         createBundle("chrome://weave/locale/services/sync.properties");
});

