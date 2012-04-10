/*! 
 * Riloadr.js 1.0 (c) 2012 Tubal Martin - MIT license
 */
!function(definition) {
    if (typeof define === 'function' && define.amd) {
        // Register as an AMD module.
        define(definition);
    } else {
        // Browser globals
        window.Riloadr = definition();
    }
}(function(){
    
    'use strict';
    
    var ON = 'on'
      , TRUE = !0
      , FALSE = !1
      , NULL = null
      , LOAD = 'load'
      , ERROR = 'error'
      , LENGTH = 'length'
      , SCROLL = 'scroll'
      , RESIZE = 'resize'
      , ONLOAD = ON+LOAD
      , ONERROR = ON+ERROR
      , RETRIES = 'retries'
      , COMPLETE = 'complete'
      , RILOADED = 'riloaded'
      , CLASSNAME = 'className'
      , READYSTATE = 'readyState'
      , ORIENTATION = 'orientation'
      , EVENTLISTENER = 'EventListener'
      , READYSTATECHANGE = 'readystatechange'
      , QUERYSELECTORALL = 'querySelectorAll'
      , ORIENTATIONCHANGE = ORIENTATION+'change'
      , GETBOUNDINGCLIENTRECT = 'getBoundingClientRect'
      
      , win = window
      , doc = win.document
      , docElm = doc.documentElement
      , belowfoldSupported = GETBOUNDINGCLIENTRECT in docElm
      , orientationSupported = ORIENTATION in win && ON+ORIENTATIONCHANGE in win
      , selectorsApiSupported = QUERYSELECTORALL in doc
      
      // Topics/subscriptions map (Pub/Sub)
      , topics = {}
      
      // Calculated width of the viewport in CSS pixels.
      , viewportWidth = 0
      
      // Uninitialized vars
      , addEvent, removeEvent, onDomReady, body, lastOrientation
      , scrollEventRegistered, resizeEventRegistered, orientationEventRegistered;
      
    
    
    // If Modernizr is missing remove "no-js" class from <html> element, if it exists:
    !('Modernizr' in win) && 
        (docElm[CLASSNAME] = docElm[CLASSNAME].replace(/(^|\s)no-js(\s|$)/, '$1$2'));
    
    
    /*
     * Constructor: Riloadr
     *    Creates a Riloadr object
     * Parameters:
     *    options - Object containing configuration options
     */
    function Riloadr(options) {
        
        // PRIVATE PROPERTIES
        // ------------------
        
        
        var instance = this
        
            // Base URL
          , baseUrl = options.baseUrl || ''
        
            // Defer load: disabled by default, if enabled fallbacks to "load". 
            // Possible values: 'belowfold' & 'load'.
          , deferMode = (options.defer + '').toLowerCase() || FALSE
            
            // 'belowfold' defer mode?
          , belowfoldEnabled = belowfoldSupported && deferMode === 'belowfold'
            
            // # of times to retry to load an image if initial loading failed.
          , retries = +options[RETRIES] || 0
          
          // Setting threshold to n causes image to load n pixels before it is visible.
          , threshold = +options.threshold || 100
            
            // DOM node where Riloadr must look for 'responsive' images.
            // Fallbacks to body if not set.
          , parentNode
            
            // Size of images to use.
          , imgSize
            
            // Static list (array) of images.
          , images;
        
        
        // PRIVATE METHODS
        // ---------------
        
        
        function init() {
            if (deferMode === 'belowfold') {
                // React on scroll, resize and orientationchange events
                // Attach event listeners just once & notify Riloadr instances of events.
                if (belowfoldEnabled) {
                    // Reduce by 5.5x the # of times loadImages is called when scrolling
                    if (!scrollEventRegistered) {
                        scrollEventRegistered = TRUE;
                        addEvent(win, SCROLL, throttle(function() {
                            publish(SCROLL);
                        }, 250));
                    }
                    subscribe(SCROLL, instance.loadImages);
                    
                    // Reduce to 1 the # of times loadImages is called when resizing
                    if (!resizeEventRegistered) {
                        resizeEventRegistered = TRUE;
                        addEvent(win, RESIZE, debounce(function() {
                            publish(RESIZE);
                        }, 250));
                    }
                    subscribe(RESIZE, instance.loadImages);
                    
                    // Is orientationchange event supported? If so, let's try to avoid false 
                    // positives by checking if win.orientation has actually changed.
                    // Reduce to 1 the # of times loadImages is called when orientation changes.
                    if (orientationSupported) {
                        if (!orientationEventRegistered) {
                            orientationEventRegistered = TRUE;
                            lastOrientation = win[ORIENTATION];
                            addEvent(win, ORIENTATIONCHANGE, debounce(function(){
                                if (win[ORIENTATION] !== lastOrientation) {
                                    lastOrientation = win[ORIENTATION];
                                    publish(ORIENTATIONCHANGE);
                                }
                            }, 250));
                        }
                        subscribe(ORIENTATIONCHANGE, instance.loadImages);
                    }
                }
                
                // Load initial "above the fold" images OR all images if the browser 
                // does not support the 'getBoundingClientRect' method.
                instance.loadImages();
                
            } else if (deferMode === LOAD) {
                // Load all images after win is loaded
                onWindowReady(instance.loadImages);
                
            } else {
                // No defer mode, load all images now!  
                instance.loadImages();
            }
        }
        
        
        /*
         * Collects all 'responsive' images from the DOM node specified.
         * If no DOM node is specified, it fallbacks to body.
         */
        function getImages(update) {
            // If initial collection is done and 
            // no new images have been added to the DOM, exit.
            if (images && update !== TRUE) return;
            !images && (images = []);
            
            var imageList = selectorsApiSupported && 
                    parentNode[QUERYSELECTORALL]('img.responsive') || 
                    parentNode.getElementsByTagName('img')
              , i = 0
              , l = imageList[LENGTH]
              , current;         
            
            // Create a static list
            for (; i < l; i++) {
                current = imageList[i];
                // If we haven't processed this image yet and it is a responsive image
                if (current && !current[RILOADED] &&
                    (selectorsApiSupported || current[CLASSNAME].indexOf('responsive') >= 0)) {
                    images.push(current);
                }
            }

            // Clean up
            imageList = current = NULL;
        }
        
        
        /*
         * Loads an image.
         */
        function loadImage(img) {   
            // Flag to avoid reprocessing
            img[RILOADED] = TRUE;
            
            // Initial # of times we tried to reload this image
            img[RETRIES] = 0;
            
            // Callbacks
            img[ONLOAD] = imageOnloadCallback;
            img[ONERROR] = imageOnerrorCallback;
                    
            // Load it    
            img.src = getImageSrc(img);
        }
        
        
        /*
         * Image onload Callback
         */
        function imageOnloadCallback() {
            var img = this;
            img[ONLOAD] = img[ONERROR] = NULL;
            img[CLASSNAME] = img[CLASSNAME].replace(/(^|\s)responsive(\s|$)/, '$1$2');
            ONLOAD in options && options[ONLOAD].call(img); 
        }
        
        
        /*
         * Image onerror Callback
         * If user sets 'retries' > 0, Riloadr will try to load an image n times if 
         * an image fails to load.
         */
        function imageOnerrorCallback() {
            var img = this;
            if (retries > 0 && img[RETRIES] < retries) {
                img[RETRIES]++;
                img.src = getImageSrc(img, TRUE);
            }    
            ONERROR in options && options[ONERROR].call(img); 
        }
        
        
        /*
         * Returns the URL of an image
         * If reload is TRUE, a timestamp is added to avoid caching.
         */
        function getImageSrc(img, reload) {
            return (img.getAttribute('data-base') || baseUrl) +
                (img.getAttribute('data-'+imgSize) || '') +
                (reload ? '?'+(new Date).getTime() : '');         
        } 
        
        
        /*
         * Reduces the images array for shorter loops
         */
        function removeImage(idx) {
            images.splice(idx, 1); 
        }
        
        
        /*
         * Tells if an image is visible to the user or not (considering the threshold set). 
         */
        function isBelowTheFold(img) {
            var CLIENTHEIGHT = 'clientHeight', CLIENTTOP = 'clientTop'
              , clientTop = docElm[CLIENTTOP] || body[CLIENTTOP] || 0
              , clientHeight = doc.compatMode === 'CSS1Compat' && docElm[CLIENTHEIGHT] || 
                    body && body[CLIENTHEIGHT] || docElm[CLIENTHEIGHT];
    
            // Threshold: 100px    
            return clientHeight <= img[GETBOUNDINGCLIENTRECT]().top - clientTop - threshold;                 
        }

        
        // PUBLIC PRIVILEGED METHODS
        // -------------------------
        
        
        /*
         * Loads 'responsive' images
         * Notes:
         * - Friendly with other scripts running.
         * - Must be publicly accesible for Pub/Sub but should not be called directly.
         */ 
        instance.loadImages = function () {
            var args = arguments;

            // Schedule it to run after the current call stack has cleared.
            defer(function(){
                getImages.apply(NULL, args);
                
                // No images to load? finish!
                if (!images[LENGTH]) return;

                for (var current, i = 0, l = images[LENGTH]; i < l; i++) {
                    current = images[i];
                    if (current && !current[RILOADED]) {
                        if (belowfoldEnabled) { 
                            if (!isBelowTheFold(current)) {
                                loadImage(current);
                                removeImage(i);
                                i--;
                            }
                        } else {
                            loadImage(current);
                            removeImage(i);
                            i--;
                        }
                    }            
                }

                // Clean up
                current = NULL;
            });
        };
        
        
        /* 
         * The "riload" method allows you to load responsive images inserted into the 
         * document after the DOM is ready or after win is loaded (useful for AJAX 
         * content & markup created dynamically with javascript). 
         * Call this method after new markup is inserted into the document.
         */
        instance.riload = function() {
            instance.loadImages(TRUE);           
        };
        
        
        // INITIALIZATION
        // --------------
        
        
        onDomReady(function(){
            body = doc.body;
            parentNode = options.parentNode || body;
            viewportWidth = viewportWidth || getViewportWidthInCssPixels(); 
            imgSize = getSizeOfImages(options.media, viewportWidth); 
            init();
        });
    };
    
    
    // PUBLIC PROPERTIES
    // -----------------
    
    
    Riloadr.prototype.version = '1.0';
    

    // HELPER FUNCTIONS
    // ----------------
    
    
    /*
     * Returns the property name (image size to use) of the 'media' object.
     * Uses the viewport width to mimic CSS behavior.
     */
    function getSizeOfImages(media, vWidth) {
        if (!media) throw new Error(RILOADR + ": Missing required 'media' property");
        
        var imgSize = ''
          , size, tmpSize, minWidth, maxWidth;  
        
        for (size in media) {
            // Reset
            tmpSize = NULL;
            
            minWidth = media[size]['minWidth'];
            maxWidth = media[size]['maxWidth'];
        
            if (minWidth && maxWidth  && vWidth >= minWidth && vWidth <= maxWidth || 
                minWidth && !maxWidth && vWidth >= minWidth || 
                maxWidth && !minWidth && vWidth <= maxWidth) {
                tmpSize = size;
            } 
            
            // Update if new size found
            tmpSize && (imgSize = tmpSize);
        } 
        
        return imgSize;
    }
    
    
    /*
     * Returns the viewport width in CSS pixels.
     * Reference: http://www.quirksmode.org/mobile/tableViewport.html
     */
    function getViewportWidthInCssPixels() {
        var devicePixelRatio = parseFloat(win.devicePixelRatio)
          , screenWidth = win.screen.width
          , widths = [docElm.clientWidth, docElm.offsetWidth, body.clientWidth]
          , i = 0
          , l = widths[LENGTH];
          
        // HDPi screens
        if (!isNaN(devicePixelRatio) && devicePixelRatio > 1) {
            return Math.ceil(screenWidth / devicePixelRatio);    
        }
        
        // Any other screen
        for (; i < l; i++) {
            if (!isNaN(widths[i])) {
                return Math.ceil(widths[i]);
            }
        }
        
        // Fallback
        return screenWidth;
    } 
    
    
    /* 
     * Thanks to underscore.js
     * Returns a function, that, when invoked, will only be triggered at most once
     * during a given win of time.
     */
    function throttle(func, wait) {
        var context, args, timeout, throttling, more, result
          , whenDone = debounce(function(){ more = throttling = FALSE; }, wait);
        return function() {
            context = this; args = arguments;
            var later = function() {
                timeout = NULL;
                if (more) func.apply(context, args);
                whenDone();
            };
            if (!timeout) timeout = setTimeout(later, wait);
            if (throttling) {
                more = TRUE;
            } else {
                result = func.apply(context, args);
            }
            whenDone();
            throttling = TRUE;
            return result;
        };
    }
    
    
    /* 
     * Thanks to underscore.js
     * Returns a function, that, as long as it continues to be invoked, will not
     * be triggered. The function will be called after it stops being called for
     * N milliseconds. If `immediate` is passed, trigger the function on the
     * leading edge, instead of the trailing.
     */
    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments
              , later = function() {
                    timeout = NULL;
                    if (!immediate) func.apply(context, args);
                };
            if (immediate && !timeout) func.apply(context, args);
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    
    /*
     * Inspired by underscore.js
     * Defers a function, scheduling it to run after the current call stack has cleared.
     */
    function defer(func) {
        var args = Array.prototype.slice.call(arguments, 1);
        return setTimeout(function(){ return func.apply(NULL, args); }, 1);
    }
    
    
    /*
     * Barebones Pub/Sub
     */
    function publish(topic) {
        var subscribers = topics[topic]
          , i, l;
        
        if (!subscribers) return;

        for (i = 0, l = subscribers.length; i < l; i++) {
            try { subscribers[i](); } catch (e) {}
        }
    }
    
    
    function subscribe(topic, fn) {
        (topics[topic] || (topics[topic] = [])).push(fn);
    }


    /*
     * Simple event attachment/detachment
     */
    !function() {
        var w3c = 'add'+EVENTLISTENER in doc
          , add = w3c ? 'add'+EVENTLISTENER : 'attachEvent'
          , rem = w3c ? 'remove'+EVENTLISTENER : 'detachEvent'
          , pre = w3c ? '' : ON;
        
        addEvent = function(elem, type, fn) {
            elem[add](pre + type, fn, FALSE);
        };
        
        removeEvent = function(elem, type, fn) {
            elem[rem](pre + type, fn, FALSE);
        };
    }();
    
    
    /*
     * onDomReady.js 1.0 (c) 2012 Tubal Martin - MIT license
     * https://github.com/tubalmartin/ondomready
     * Notes:
     * - Slightly adapted for Riloadr
     */
    onDomReady = (function(){
        var DOMContentLoaded = 'DOMContentLoaded',
        addEventListener = 'add'+EVENTLISTENER,
        attachEvent = 'attachEvent',
        toplevel = FALSE,
        
        // Callbacks pending execution until DOM is ready
        callbacks = [],
        
        // Is the DOM ready to be used? Set to true once it occurs.
        isReady = FALSE,
        
        // The document ready event handler
        DOMContentLoadedHandler;
        
        // Handle when the DOM is ready
        function ready( fn ) {
            if ( isReady ) {
                return;
            }
            
            // Make sure body exists, at least, in case IE gets a little overzealous.
            if ( !doc.body ) {
                return defer( ready );
            }
            
            // Remember that the DOM is ready
            isReady = TRUE;
    
            // Execute all callbacks
            while ( fn = callbacks.shift() ) {
                defer( fn );
            }    
        }
        
        // The DOM ready check for Internet Explorer
        function doScrollCheck() {
            if ( isReady ) {
                return;
            }
        
            try {
                // If IE is used, use the trick by Diego Perini
                // http://javascript.nwbox.com/IEContentLoaded/
                docElm.doScroll('left');
            } catch(e) {
                return defer( doScrollCheck );
            }
        
            // and execute any waiting functions
            ready();
        }
        
        // Attach the listeners:
        // Catch cases where onDomReady is called after the
        // browser event has already occurred.
        if ( doc[READYSTATE] === COMPLETE ) {
            ready();
        } else {
            // W3C event model
            if ( doc[addEventListener] ) {
                DOMContentLoadedHandler = function() {
                    removeEvent( doc, DOMContentLoaded, DOMContentLoadedHandler );
                    ready();
                };
                
                // Use the handy event callback
                addEvent( doc, DOMContentLoaded, DOMContentLoadedHandler );
        
            // IE event model
            } else if ( doc[attachEvent] ) {
                DOMContentLoadedHandler = function() {
                    if ( doc[READYSTATE] === COMPLETE ) {
                        removeEvent( doc, READYSTATECHANGE, DOMContentLoadedHandler );
                        ready();
                    }
                };
                
                // ensure firing before onload,
                // maybe late but safe also for iframes
                addEvent( doc, READYSTATECHANGE, DOMContentLoadedHandler );

                // If IE and not a frame
                // continually check to see if the document is ready
                try {
                    toplevel = win.frameElement == NULL;
                } catch(e) {}
        
                if ( docElm.doScroll && toplevel ) {
                    doScrollCheck();
                }
            }
            
            // A fallback to win.onload, that will always work
            addEvent( win, LOAD, ready );
        } 
        
        return function( fn ) { 
            // If DOM is ready, execute the function (async), otherwise wait
            isReady ? defer( fn ) : callbacks.push( fn );
        };
    }());
    
    
    /*
     * Wrapper to attach load event handlers to the win
     * Notes: 
     * - Compatible with async script loading
     */
    function onWindowReady(fn) {
        // Catch cases where onWindowReady is called after 
        // the browser event has already occurred.
        if (doc[READYSTATE] === COMPLETE) {
            fn();
        } else {
            var _fn = function() {
                removeEvent(win, LOAD, _fn);
                fn();
            };
            addEvent(win, LOAD, _fn);
        }    
    }

    
    return Riloadr; 
        
});