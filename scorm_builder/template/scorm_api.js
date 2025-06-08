var pipwerks = { SCORM:{} };
(function(){
  var API = null;
  pipwerks.SCORM.version = "1.2";
  pipwerks.SCORM.handle = null;
  pipwerks.SCORM.init = function(){
    API = getAPIHandle();
    if (API) {
      return API.LMSInitialize("") == "true";
    }
    return false;
  };
  pipwerks.SCORM.get = function(param){
    if (API) return API.LMSGetValue(param);
    return null;
  };
  pipwerks.SCORM.set = function(param,value){
    if (API) return API.LMSSetValue(param,value);
    return null;
  };
  pipwerks.SCORM.save = function(){
    if (API) return API.LMSCommit("");
    return null;
  };
  pipwerks.SCORM.quit = function(){
    if (API) return API.LMSFinish("");
    return null;
  };
  function getAPIHandle(){
    if (window.API) return window.API;
    if (window.parent && window.parent.API) return window.parent.API;
    if (window.top && window.top.API) return window.top.API;
    return null;
  }
})();
