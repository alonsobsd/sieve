/*
 * The contents of this file is licenced. You may obtain a copy of the license
 * at http://sieve.mozdev.org or request it via email from the author. 
 *
 * Do not remove or change this comment.
 * 
 * The initial author of the code is:
 *   Thomas Schmid <schmid-thomas@gmx.net>
 */

// @include "/sieve/src/sieve@mozdev.org/chrome/chromeFiles/content/libs/libManageSieve/SieveResponse.js"

// TODO protect namespace:
//var gSivEditor = {
// call this with gSivEditor...
  
var gSieve = null;
var gSieveWatchDog = null

var gCompileTimeout = null;
var gCompileDelay = null;

/** @type Boolean */
var gChanged = false;

var gBackHistory = new Array();
var gForwardHistory = new Array();

var gPrintSettings = null;

// the cursor position is updated lazyly
var gUpdateScheduled = false;

var event = 
{
  /**
   * @param {SieveGetScriptResponse} response
   */
  onGetScriptResponse: function(response)
  {
    event.onScriptLoaded(response.getScriptBody());
  },
  
  /**
   * @param {String} script
   */
  onScriptLoaded: function(script)
  {
    document.getElementById("txtScript").value = script;
    document.getElementById("txtScript").setSelectionRange(0, 0);
	UpdateCursorPos();
  },

  /**
   * @param {SievePutScriptResponse} response
   */
  onPutScriptResponse: function(response)
  {
    gChanged = false;

    clearTimeout(gCompileTimeout);
    gSieve.removeWatchDogListener();
    close();
  },

  /**
   * @param {SieveAbstractResponse} response
   */
  onError: function(response)
  {
    alert("FATAL ERROR:"+response.getMessage());
  },

  onTimeout: function()
  {
    alert("A Timeout occured");
  },

  onIdle: function()
  {
    // as we send a keep alive request, we don't care
    // about the response...
    var request = new SieveCapabilitiesRequest();
    request.addErrorListener(event);

    gSieve.addRequest(request);
  },

  onWatchDogTimeout: function()
  {
    // call sieve object indirect inoder to prevent a
    // ring reference
    gSieve.onWatchDogTimeout();
  }
}

function onCompile()
{
  var lEvent =
  {
    onPutScriptResponse: function(response)
    {
      // we need no handlers thus we don't care if the call succseeds
      gSieve.addRequest(new SieveDeleteScriptRequest("TMP_FILE_DELETE_ME"));

      document.getElementById("lblErrorBar").firstChild.nodeValue
        = "Server reports no script errors...";

      document.getElementById("imgErrorBar").src
        = "chrome://sieve/content/images/syntax-ok.png";
    },

    onError: function(response)
    {
      document.getElementById("lblErrorBar").firstChild.nodeValue
        = response.getMessage();

      document.getElementById("imgErrorBar").src
        = "chrome://sieve/content/images/syntax-error.png";
      // the server did not accept our script therfore we can't delete it...
    },

    onTimeout: function()
    {
      alert("A Timeout occured");
    }
  }
  
  var script = new String(document.getElementById("txtScript").value);
  
  if (script.length == 0)
    return;
  
  var request = new SievePutScriptRequest(
                  "TMP_FILE_DELETE_ME",script);
  request.addPutScriptListener(lEvent);
  request.addErrorListener(lEvent);
  
  gSieve.addRequest(request);
}

function onInput()
{
  if (gChanged == false)
    document.getElementById("sbChanged").label = "Changed";
  
  gChanged = true;
  
  // on every keypress we reset the timeout
  if (gCompileTimeout != null)
  {
    clearTimeout(gCompileTimeout);
    gCompileTimeout = null;
  }
  
  if (document.getElementById("btnCompile").checked)
    gCompileTimeout = setTimeout(function() {onCompile();}, gCompileDelay);
}

function onLoad()
{
  // checkbox buttons are buggy,this has been fixed in Thunderbird3 but...
  // ...we need a workaround. See Bug 382457 for details.

  document.getElementById("btnCompile").
    addEventListener(
      "command",
      function() {onErrorBar();},
      false);
  
  document.getElementById("btnReference").
    addEventListener(
      "command",
      function() {onSideBar(); },
      false);
  
  document.getElementById("btnSearchBar").
    addEventListener(
      "command",
      function() {onSearchBar();},
      false);
  
  // hack to prevent links to be opened in the default browser window...
  document.getElementById("ifSideBar").
    addEventListener(
      "click",
      function(event) {onSideBarBrowserClick(event);},
      false);
  
  // Connect to the Sieve Object...
  gSieve = window.arguments[0]["sieve"];
  
  // ... redirect errors into this window
  gSieveWatchDog = new SieveWatchDog();
  gSieveWatchDog.addListener(event);
  gSieve.addWatchDogListener(gSieveWatchDog);
  
  gCompileDelay = window.arguments[0]["compileDelay"];
  
  document.getElementById("txtName").value = window.arguments[0]["scriptName"];
  
  document.getElementById("lblErrorBar").firstChild.nodeValue
    = "Server reports no script errors...";
  
  if (window.arguments[0]["scriptBody"] != null)
  {
    event.onScriptLoaded(window.arguments[0]["scriptBody"]);
  }
  else
  {
    var request = new SieveGetScriptRequest(window.arguments[0]["scriptName"]);
    request.addGetScriptListener(event);
    request.addErrorListener(event);

    gSieve.addRequest(request);
  }
  
  //preload sidebar...
  onSideBarHome();
  
  onErrorBar(window.arguments[0]["compile"]);
  onSideBar(true);
  onSearchBar(false);
  
  document.getElementById("txtScript").setSelectionRange(0, 0);
  document.getElementById("txtScript").focus();

  /*
   * window.document.documentElement.addEventListener('focus', function(event) {
   * if (event.target.nodeName=='textbox' &&
   * event.target.hasAttribute('readonly')) {
   * window.document.documentElement.focus(); } }, true);
   */
}

function onSideBarBrowserClick(event)
{
  var href = null;
  
  if (event.target.nodeName == "A")
    href = event.target.href;
  else if (event.target.parentNode.nodeName == "A")
    href = event.target.parentNode.href;
  else
    return;

  event.preventDefault();

  if (gForwardHistory.length != 0)
    gForwardHistory = new Array();

  onSideBarGo(href);
}

function onSideBarBack()
{
  // store the current location in the history...
  gForwardHistory.push(gBackHistory.pop());
  // ... and go back to the last page
  onSideBarGo(gBackHistory.pop());
}

function onSideBarForward()
{
  onSideBarGo(gForwardHistory.pop());
}

function onSideBarHome()
{
  if (gForwardHistory.length != 0)
    gForwardHistory = new Array();

  //document.getElementById("ifSideBar").setAttribute('src',uri);
  onSideBarGo("http://sieve.mozdev.org/reference/en/index.html");
}

function onSideBarLoading(loading)
{
  if (loading)
    document.getElementById("dkSideBarBrowser").selectedIndex = 1;
  else
    document.getElementById("dkSideBarBrowser").selectedIndex = 0;
}

function onSideBarGo(uri)
{
  onSideBarLoading(true);
  
  gBackHistory.push(uri);
  
  if (gBackHistory.length > 20)
    gBackHistory.shift();
  
  if (gBackHistory.length == 1)
    document.getElementById("btnSideBarBack").setAttribute('disabled',"true");
  else
    document.getElementById("btnSideBarBack").removeAttribute('disabled');

  if (gForwardHistory.length == 0)
    document.getElementById("btnSideBarForward").setAttribute('disabled',"true");
  else
    document.getElementById("btnSideBarForward").removeAttribute('disabled');
  
  /*if (document.getElementById("ifSideBar").addEventListener)
    document.addEventListener(
      "DOMContentLoaded", function(event) { onSideBarLoading(false); }, false);*/
  if (document.getElementById("ifSideBar").addEventListener)
    document.getElementById("ifSideBar").addEventListener(
      "DOMContentLoaded", function(event) {	onSideBarLoading(false); }, false);
  
  document.getElementById("ifSideBar").setAttribute('src', uri);
}

function onSave()
{
  var request = new SievePutScriptRequest(
                  new String(document.getElementById("txtName").value),
                  new String(document.getElementById("txtScript").value));
  request.addPutScriptListener(event);
  request.addErrorListener(event);
  
  gSieve.addRequest(request);
}

function onClose()
{
  if (gChanged == false)
  {
    gSieve.removeWatchDogListener();
    return true;
  }

  var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                          .getService(Components.interfaces.nsIPromptService);
  
  // The flags 393733 equals [Save] [Don't Save] [Cancel]
  var result =
    prompts.confirmEx(
      window, "Save Sieve Script",
      "Script has not been saved. Do you want to save changes?", 393733,
      "", "", "", null, { value : false	});
  
  switch (result)
  {
    case 2 : // Don't save
      gSieve.removeWatchDogListener();
      return true;
    case 0 : // Save
      onSave();
  }
  
  return false;
}

function onImport()
{
  var filePicker = Components.classes["@mozilla.org/filepicker;1"]
                             .createInstance(Components.interfaces.nsIFilePicker);

  filePicker.appendFilter("Sieve Scripts (*.siv)", "*.siv");
  filePicker.appendFilter("All Files (*.*)", "*.*");
  filePicker.init(window, "Import Sieve Script", filePicker.modeOpen);

  if (filePicker.show() != filePicker.returnOK)
    return;

  var inputStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                              .createInstance(Components.interfaces.nsIFileInputStream);
  var scriptableStream = Components.classes["@mozilla.org/scriptableinputstream;1"]
                                   .createInstance(Components.interfaces.nsIScriptableInputStream);

  inputStream.init(filePicker.file, 0x01, 0444, null);
  scriptableStream.init(inputStream);

  // todo insert imported snipplet instead of replacing the whole script
  var script = scriptableStream.read(scriptableStream.available());

  scriptableStream.close();
  inputStream.close();

  // Find the Start and End Position
  var el = document.getElementById("txtScript");
  var start = el.selectionStart;
  var end = el.selectionEnd;

  /* Remember obj is a textarea or input field */
  el.value = el.value.substr(0, start)
    + script
    + el.value.substr(end, el.value.length);
  
  onInput();
}

function onExport()
{
  var filePicker = Components.classes["@mozilla.org/filepicker;1"]
			.createInstance(Components.interfaces.nsIFilePicker);

	filePicker.defaultExtension = ".siv";
	filePicker.defaultString = document.getElementById("txtName").value
			+ ".siv";

	filePicker.appendFilter("Sieve Scripts (*.siv)", "*.siv");
	filePicker.appendFilter("Text Files (*.txt)", "*.txt");
	filePicker.appendFilter("All Files (*.*)", "*.*");
	filePicker.init(window, "Export Sieve Script", filePicker.modeSave);

	var result = filePicker.show();

	if ((result != filePicker.returnOK) && (result != filePicker.returnReplace))
		return;

	var file = filePicker.file;

	if (file.exists() == false)
		file.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0644);

	var outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			.createInstance(Components.interfaces.nsIFileOutputStream);

	outputStream.init(file, 0x04 | 0x08 | 0x20, 0644, null);

	var data = document.getElementById("txtScript").value;
	outputStream.write(data, data.length);
	outputStream.close();
}

/**
 * Shows the sidebar containing script errors
 */
function onErrorBarShow()
{
  document.getElementById("btnCompile").setAttribute('checked', 'true')
  document.getElementById('spErrorBar').removeAttribute('hidden');
  document.getElementById('vbErrorBar').removeAttribute('hidden');

  onCompile();

  return;
}

/**
 * Hides the sidebar containing script errors...
 */
function onErrorBarHide()
{
  clearTimeout(gCompileTimeout);
  gCompileTimeout = null;
  
  document.getElementById("btnCompile").removeAttribute('checked');
  document.getElementById("vbErrorBar").setAttribute('hidden', 'true');
  document.getElementById('spErrorBar').setAttribute('hidden', 'true');
  
  return;
}

function onErrorBar(visible)
{
  if (visible == null)
    visible = document.getElementById('btnCompile').checked

  if (visible)
    onErrorBarShow();
  else
    onErrorBarHide();

  return;
}

/**
 * Shows the Sidebar containing the Sieve Reference
 */
function onSideBarShow()
{
  document.getElementById('btnReference').setAttribute('checked', 'true')
  document.getElementById('splitter').removeAttribute('hidden');
  document.getElementById('vbSidebar').removeAttribute('hidden');
  
  return;
}

/**
 * Shows the Sidebar containing the Sieve Reference
 */
function onSideBarHide()
{
  document.getElementById('btnReference').removeAttribute('checked');
  document.getElementById('splitter').setAttribute('hidden', 'true');
  document.getElementById('vbSidebar').setAttribute('hidden', 'true')
  
  onSearchBarHide();
  
  return;
}

function onSideBar(visible)
{
  if (visible == null)
    visible = document.getElementById('btnReference').checked
  
  if (visible)
    onSideBarShow();
  else
    onSideBarHide();
  
  return;
}

/**
 * Shows the SearchBar. As it is embedded in the SideBar, it will automatically
 * display the SideBar if it is not already visible
 */
function onSearchBarShow()
{
  onSideBarShow();
  
  document.getElementById('btnSearchBar').setAttribute('checked', 'true')
  document.getElementById('vbSearchBar').removeAttribute('hidden');
  
  return;
}

/**
 * Hides the in the SideBar embedded SearchBar...
 */
function onSearchBarHide()
{
  
  document.getElementById('vbSearchBar').setAttribute('hidden', 'true')
  document.getElementById('btnSearchBar').removeAttribute('checked');
  
  return;
}

function onSearchBar(visible)
{
  if (visible == null)
    visible = document.getElementById('btnSearchBar').checked

  if (visible)
    onSearchBarShow();
  else
    onSearchBarHide();

  return;
}

function OnFindString()
{
  var txtScript = document.getElementById("txtScript");
  var script = new String(txtScript.value);
  
  if (script.length == 0)
    return;
  
  // Get the cursor position...
  var position = txtScript.selectionStart;
  
  if (txtScript.selectionStart != txtScript.selectionEnd)
    position = txtScript.selectionEnd;
  
  // ... and prepare strings for search...
  var token = new String(document.getElementById("txtToken").value);
  
  // ... convert to lowercase, if the search is not case sensitive...
  if (document.getElementById('cbxCaseSensitive').checked == false)
  {
    script = script.toLowerCase();
    token = token.toLowerCase();
  }
  
  var result = -1;
  
  // ... the backward search is a bit tricky...
  if (document.getElementById('cbxBackward').checked)
  {
    // The search result has to be before the current cursor...
    // ... position, this means we can drop anything behind it.
    script = script.substring(0, position - 1);
    result = script.lastIndexOf(token);
    
    position = script.length - position;
  }
  else
  {
    result = script.indexOf(token, position);
  }

  // start search from cursor pos...
  if (result == -1)
  {
    alert('Phrase not found...')
    return -1;
  }

  txtScript.focus();

  txtScript.setSelectionRange(result, result + token.length);
  txtScript.editor.selectionController.scrollSelectionIntoView(1, 1, true);

  return 0;
}

function OnReplaceString()
{
  var txtScript = document.getElementById("txtScript");
  var token = new String(document.getElementById("txtToken").value);
  
  var selectedToken =
    txtScript.value.substring(txtScript.selectionStart,txtScript.selectionEnd);
  
  if (selectedToken != token)
    this.OnFindString();
  
  selectedToken = 
    txtScript.value.substring(txtScript.selectionStart,txtScript.selectionEnd);
  
  if (selectedToken != token)
    return;
  
  var newToken = new String(document.getElementById("txtReplace").value);
  var selStart = txtScript.selectionStart;
  var selEnd = txtScript.selectionEnd
  /* Remember obj is a textarea or input field */
  txtScript.value = txtScript.value.substr(0, selStart) + newToken
    + txtScript.value.substr(selEnd, txtScript.value.length);
  
  txtScript.focus();
  
  txtScript.setSelectionRange(selStart, selStart + newToken.length);
  txtScript.editor.selectionController.scrollSelectionIntoView(1, 1, true);
  
  this.onInput();
  
}

/*function onBlubb()
{
  
  
  var txtScript = document.getElementById("txtScript");
  
  alert(txtScript.editor);
  
  if (txtScript.editor instanceof Components.interfaces.nsIHTMLEditor)
    alert("HTML");
    
  if (txtScript.editor instanceof Components.interfaces.nsIPlaintextEditor)
    alert("plain text");
    
  return;
  
  var myDocument = txtScript.editor.document;

  
  var neuB = myDocument.createElement("b");
  var neuBText = myDocument.createTextNode("mit fettem Text ");
  neuB.appendChild(neuBText);
  
  //document.getElementById("derText").insertBefore(neuB, document.getElementById("derKursiveText"));
 
  var root = txtScript.editor.rootElement;

//106           const nsIDOMNSEditableElement = Components.interfaces.nsIDOMNSEditableElement;
//107           return this.inputField.QueryInterface(nsIDOMNSEditableElement).editor;

  root.appendChild(neuB);
  //root.firstChild.insertBefore(neuB, document.getElementById("derKursiveText"));
  
  for (var item = root.firstChild; item; item = item.nextSibling) 
    alert(item);
}*/

function UpdateCursorPos() {
  var el = document.getElementById("txtScript");
  var lines = el.value.substr(0, el.selectionStart).split("\n");

  document.getElementById("sbCursorPos")
          .label = lines.length+":"+(lines[lines.length - 1].length + 1);
  
  if (el.selectionEnd != el.selectionStart)
  {
    lines = el.value.substr(0, el.selectionEnd).split("\n");
    document.getElementById("sbCursorPos")
            .label += " - " + lines.length+ ":" + (lines[lines.length - 1].length + 1);
  }
  
  gUpdateScheduled = false;
  
  return;
}

function onUpdateCursorPos(timeout)
{
  if (gUpdateScheduled)
    return;

  setTimeout(function() {UpdateCursorPos();	gUpdateScheduled = false;}, 200);

  gUpdateScheduled = true;
}

function onBtnChangeView()
{
 /* var deck = document.getElementById("dkView");
  
  if (deck.selectedIndex == 0)
    document.getElementById("dkView").selectedIndex = 1;
  else
    document.getElementById("dkView").selectedIndex = 0;*/
  
}

function getPrintSettings()
{
  var pref = Components.classes["@mozilla.org/preferences-service;1"]
               .getService(Components.interfaces.nsIPrefBranch);
  if (pref) 
  {
    var gPrintSettingsAreGlobal = pref.getBoolPref("print.use_global_printsettings", false);
    var gSavePrintSettings = pref.getBoolPref("print.save_print_settings", false);
  }
 
  var printSettings;
  try 
  {
    var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                  .getService(Components.interfaces.nsIPrintSettingsService);
    if (gPrintSettingsAreGlobal) 
    {
      printSettings = PSSVC.globalPrintSettings;
      this.setPrinterDefaultsForSelectedPrinter(PSSVC, printSettings);
    }
    else
    {
      printSettings = PSSVC.newPrintSettings;
    }
  }
  catch (e)
  {
    alert("getPrintSettings: "+e+"\n");
  }
  return printSettings;
}


function onPrint()
{
  // we print in xml this means any specail charaters have to be html entities...
  // ... so we need a dirty hack to convert all entities...
  alert("Print");
  var script = document.getElementById("txtScript").value;
  script = (new XMLSerializer()).serializeToString(document.createTextNode(script));
  
  script = script.replace(/\r\n/g,"\r");
  script = script.replace(/\n/g,"\r");
  script = script.replace(/\r/g,"\r\n");
 
  var data = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n" 
     + "<?xml-stylesheet type=\"text/css\" href=\"chrome://sieve/content/editor/print.css\"?>\r\n"
     + "<SieveScript>\r\n"
       + "<title xmlns=\"http://www.w3.org/1999/xhtml\">\r\n"
         + document.getElementById("txtName").value
       + "</title>\r\n"
       + "<SieveScriptName>\r\n" 
         + document.getElementById("txtName").value
       + "</SieveScriptName>\r\n"   
       + "<SieveScriptLine>\r\n"       
         + script
       + "</SieveScriptLine>\r\n"          
     + "</SieveScript>\r\n";    
  
  data =  "data:application/xml;base64,"+btoa(data);  

   /*// get URI and add to list for printing
  var messageList =  new Array(1);
  messageList[0] = data;
     
  var prevPS = gPrintSettings;
 
  var printSettingsService = 
        Components.classes["@mozilla.org/gfx/printsettings-service;1"]
          .getService(Components.interfaces.nsIPrintSettingsService);
   
  var printSettings = printSettingsService.CreatePrintSettings();
  // var printSettings = printSettingsService.globalPrintSettings;

  printEngineWindow = window.openDialog("chrome://messenger/content/msgPrintEngine.xul",
                                        "",
                                        "chrome,dialog=no,all,centerscreen",
                                        messageList.length, messageList, statusFeedback, 
                                        printSettings, false, 
                                        Components.interfaces.nsIMsgPrintEngine.MNAB_PRINT_MSG,
                                        window)*/
                  

   var printSettings;// = getPrintSettings();
   /* get the print engine instance */
   var printEngine = Components.classes["@mozilla.org/messenger/msgPrintEngine;1"].createInstance();
   printEngine.QueryInterface(Components.interfaces.nsIMsgPrintEngine);

   var printSettingsService = 
        Components.classes["@mozilla.org/gfx/printsettings-service;1"]
          .getService(Components.interfaces.nsIPrintSettingsService);
   var printSettings = printSettingsService.newPrintSettings;
   
   printEngine.setWindow(window);
   printEngine.doPrintPreview = false;
   printEngine.showWindow(false);
   printEngine.setMsgType(Components.interfaces.nsIMsgPrintEngine.MNAB_PRINT_MSG);
   printEngine.setParentWindow(null);
   //printEngine.setParentWindow(window);   

   var messageList =  new Array(1);
   messageList[0] = data;
 
   printEngine.setPrintURICount(messageList.length);
   printEngine.addPrintURI(messageList);
   
   printEngine.startPrintOperation(printSettings);
 
//     printEngine.setStatusFeedback(statusFeedback);
//     printEngine.setStartupPPObserver(gStartupPPObserver);
                     
  alert("End Print");
}
/*function onPrint()
{  
  var statusFeedback;
  statusFeedback = Components.classes["@mozilla.org/messenger/statusfeedback;1"].createInstance();
  statusFeedback = statusFeedback.QueryInterface(Components.interfaces.nsIMsgStatusFeedback);

  // we print in xml this means any specail charaters have to be html entities...
  // ... so we need a dirty hack to convert all entities...
  
  var script = document.getElementById("txtScript").value;
  script = (new XMLSerializer()).serializeToString(document.createTextNode(script));
  
  script = script.replace(/\r\n/g,"\r");
  script = script.replace(/\n/g,"\r");
  script = script.replace(/\r/g,"\r\n");
 
  var data = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n" 
     + "<?xml-stylesheet type=\"text/css\" href=\"chrome://sieve/content/editor/print.css\"?>\r\n"
     + "<SieveScript>\r\n"
       + "<title xmlns=\"http://www.w3.org/1999/xhtml\">\r\n"
         + document.getElementById("txtName").value
       + "</title>\r\n"
       + "<SieveScriptName>\r\n" 
         + document.getElementById("txtName").value
       + "</SieveScriptName>\r\n"   
       + "<SieveScriptLine>\r\n"       
         + script
       + "</SieveScriptLine>\r\n"          
     + "</SieveScript>\r\n";    
  
  data =  "data:application/xml;base64,"+btoa(data);  
  

  if (gPrintSettings == null) 
    gPrintSettings = PrintUtils.getPrintSettings();    

  printEngineWindow = window.openDialog("chrome://messenger/content/msgPrintEngine.xul",
                                         "",
                                         "chrome,dialog=no,all,centerscreen",
                                          1, [data], statusFeedback,
                                          gPrintSettings,false,
                                          Components.interfaces.nsIMsgPrintEngine.MNAB_PRINT_MSG,
                                          window);

  return;
}*/

