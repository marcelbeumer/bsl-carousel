(function(ns){
    ns.carousel = function(element, imageWidth, imageHeight) {
        /*
        Carousel "Boomshakalaka" by Marcel Beumer.

        The strategy we apply for the carousel is: 
        Walk the DOM as little and fast as possible.
        Don't walk the DOM after initialization.
        Only manipulate the elements you need to manipulate to get the visuals you need.
        Rather fast low level JavaScript than jQuery.
        Smart bookkeeping.

        This way we get max performance.
        */

        /* ideas for future optimizations:

        * precalculate (dry-run) all (or a few) possible animation states (x, y, displayBool, staples).
        * do the precalculation on load, on first mouseover or every x milliseconds.
        * optimize the drawing map routine so it stays small (smaller for-loop).

        */

        var debug = 0; // 0 - 2
        var speed = 1000; // arbitrary number, just play with it.
        var drawInterval = 20; // interval in ms, impacts overal speed and smoothness.
        if ($.browser.msie) speed = speed * 1.5; // to get things a bit the same in IE.

        var container; // main carousel container.
        var labelElements = []; // bookkeeping of label elements and who's using it.
        var imageWidth = imageWidth;  // image width.
        var imageHeight = imageHeight; // image height.
        var containerWidth; // total width of container.
        var containerHeight; // total width of container.
        var width; // the width we are drawing in.
        var height; // the height we are drawing in.

        var list; // list of items (<li>)
        var listLength; // length of the list of items.
        var initialItem; // the item we should initially display in the middle.

        var degreeStart = 90; // the start degree on the circle we are drawing on.
        var degreeEnd = 90 * 3; // the end degree on the circle we are drawing on.
        var degreeWidth = degreeEnd - degreeStart; // the width in degrees - used as 'viewport width'.
        var degreeStep = degreeWidth / 4; // how much space in degrees there is between each item.
        var degreeMiddle = degreeStart + (degreeWidth / 2); // where the middle in in the circle.
        var scrollOffset = 0; // the animation offset.
        var scrollStep = 0; // the size of each step in the animation.
        var maxY; // the exact y coordinate in pixels based on the degree middle.

        var drawingFlip = 0; // used to distinguish 'this' drawing from the 'previous'.
        var drawingMap = []; // bookkeeping of which elements we are manipulating.
        var lastUnusedLabel; // fast reference to the last known unused label.

        var scrollTimeout; // browser timeout reference.

        var degreeToRadian = function(angle) {
            return ((angle*Math.PI) / 180);
        };

        var radianToDegree = function(angle) {
            return ((angle*180) / Math.PI);
        };

        // getCicleEdge - gets the exact x/y coordinates on a circle.
        var getCircleEdge = function(radius, angle) {
            var hyp = radius;

            // we want to know the adj first
            var sin = Math.sin(angle);
            var adj = sin * hyp;

            var opp = Math.sqrt(hyp * hyp - adj * adj);

            // check in which 90 degrees segment the angle is
            var segment = Math.ceil(angle / (Math.PI / 2));
            if (segment == 1 || segment == 4) {
                opp -= opp * 2;
            }

            return [adj, opp]; // x, y
        };

        // setOpacity - setting opacity crossbrowser without jQuery.
        var setOpacity = function(e, o) {
            var s = e.style;
            if ($.browser.msie) {
                s.zoom = 1;
                s.filter = "alpha(opacity=" + Math.round(o * 100) + ")";
            } else {
                s.opacity = o;
            }
        };

        // getInitialItem - gets the initial item that should be shown in the middle (returns array index).
        var getInitialItem = function(len) {
            // make sure it chooses a image so the carousel still has things to show on the left and right
            var offset = 2;
            var pos;

            if (len < (2 * offset + 1)) {
                pos = Math.ceil(len / 2); // get the middle
            } else {
                var rlen = len - 2 * offset;
                pos = Math.ceil(Math.random() * rlen);
                pos += offset;
            }
            return pos - 1;
        };

        // getPosition - get the positin in degrees of an item.
        var getPosition = function(item, initialItem, currentPosition, stapleLeft, stapleRight) {
            var i = item;
            if (stapleLeft) {
                var pos = degreeEnd;
            } else if (stapleRight) {
                var pos = degreeStart;
            } else if (i < initialItem) {
                var pos = currentPosition + ((initialItem - i) * degreeStep);
            } else if (i > initialItem) {
                var pos = currentPosition - ((i - initialItem) * degreeStep);
            } else if (i == initialItem) {
                var pos = currentPosition;
            }
            return pos;
        };

        // setLabelContent - sets the text and href of a label element.
        var setLabelContent = function(item, label) {
            var e = item.getElementsByTagName('strong')[0];
            label.innerHTML = e.innerHTML;
            label.href = item.getElementsByTagName('a')[0].href;
        };

        /* 
        drawLabel - tries to draw the label on one of the label elements. If there is no 'free' label
        element this drawing flip (cycle) then nothing is drawn.
        */
        var drawLabel = function(item, element, opacity) {
            var i = item;
            var label;
            var labelNumber;
            var len = labelElements.length;

            // try to find a label this item is already using
            var j = len;
            while (j--) {
                var l = labelElements[j];
                if (l.usedBy == i) {
                    label = l;
                    break;
                }
            }

            if (!label) {
                // if that didn't work, find one that is unused in previous flip
                if (lastUnusedLabel) {
                    label = lastUnusedLabel;
                } else {
                    // if that didn't work, find one that is not used yet in this flip
                    var j = len;
                    while (j--) {
                        var l = labelElements[j];
                        if (l.drawingFlip != drawingFlip) {
                            label = l;
                            break;
                        }
                    }
                }
                if (label) {
                    label.usedBy = i;
                    setLabelContent(element, label.element);
                }
            }

            // in case we found a label to work on
            if (label) {
                label.drawingFlip = drawingFlip; // set the drawing flip so it gets released next flip.
                label.opacity = opacity;
                setOpacity(label.element, opacity);
            }
        };

        // drawItem - draws a single item (used by draw).
        var drawItem = function(item, initialItem, currentPosition, stapleLeft, stapleRight) {
            var i = item;
            drawingMap[i] = true; // keep track of which items we are manipulating

            var pos = getPosition(i, initialItem, currentPosition, stapleLeft, stapleRight);
            var coord = getCircleEdge(width / 2, degreeToRadian(pos));
            var x = coord[0];
            var y = coord[1];

            var yScale = (y / maxY);
            var img = list[i];
            var left = Math.floor(x + width / 2);
            var top = Math.floor(y * 1.4);
            var zIndex = Math.floor(y * 1.5);
            var opacity = (yScale * 0.75) + 0.25;

            // no jQuery here - let's do this as fast as possible.
            var s = img.style;
            s.display = 'block';
            s.left = left + 'px';
            s.top = top + 'px';
            s.zIndex = zIndex;
            setOpacity(img, opacity);

            var labelOpacity = yScale > 0.8 ?  (yScale - 0.8) * 5 : 0;
            if (labelOpacity > 0) drawLabel(i, img, labelOpacity);

            // debug >= 2: show the curve we are drawing on.
            if (debug >= 2) {
                var el = $('<div class="carousel-dbg-point"></div>').css({
                    'left' : Math.floor(x + width / 2),
                    'top' : Math.floor(y * 1.4),
                    'z-index' : 10000
                });

                $(container).append(el);
            }
        };

        // hideUnusedItems - hides items that are used last draw, but not in the current draw.
        var hideUnusedItems = function(leftItem, rightItem, drawStapleLeft, drawStapleRight) {
            /* 
            warning: the usage of the drawingMap does not scale well, though performance impact
            is propably minimal.
            */
            var i = drawingMap.length;
            while (i--) {
                if (
                    (i != drawStapleRight && i != drawStapleLeft) &&
                    (i < leftItem || i > rightItem) && 
                    drawingMap[i] === true) {
                    list[i].style.display = 'none';
                    drawingMap[i] = false;
                }
            }
        };

        // draw - draws the carousel based on current parameters. Returns bool if the animation is to an end.
        var draw = function() {

            if (drawingFlip < 2) {
                drawingFlip++;
            } else {
                drawingFlip = 0
            }

            var shouldStop = false;
            var currentPosition = degreeMiddle + scrollOffset;

            // walk to the left and see which images are in screen
            var item = initialItem;
            //var pos = currentPosition;

            var itemsToTheLeft = -(currentPosition - degreeStart) / degreeStep;
            var itemsToTheRight = (degreeEnd - currentPosition) / degreeStep;
            var rightItem = Math.floor(initialItem - itemsToTheLeft);
            var leftItem = Math.ceil(initialItem - itemsToTheRight);
            if (rightItem > (listLength - 1)) rightItem = listLength - 1;
            if (leftItem < 0) leftItem = 0;

            maxY = maxY || getCircleEdge(width / 2, degreeToRadian(degreeMiddle))[1];

            var leftPos = getPosition(leftItem, initialItem, currentPosition);
            var rightPos = getPosition(rightItem, initialItem, currentPosition);

            // in case the most left or most right is at the middle, we should stop next time
            if (leftPos <= degreeMiddle || rightPos >= degreeMiddle) shouldStop = true;

            var drawStapleLeft = leftPos < degreeEnd ? true : false;
            if (drawStapleLeft !== false) drawStapleLeft = leftItem > 0 ? leftItem - 1 : false;
            var drawStapleRight = rightPos > degreeStart ? true : false;
            if (drawStapleRight !== false) drawStapleRight = rightItem < (listLength - 1) ? rightItem + 1 : false;

            // hide images that we positioned last draw, and will not show this time.
            hideUnusedItems(leftItem, rightItem, drawStapleLeft, drawStapleRight);

            if (drawStapleLeft !== false) drawItem(drawStapleLeft, initialItem, currentPosition, true, false);
            if (drawStapleRight !== false) drawItem(drawStapleRight, initialItem, currentPosition, false, true);

            for (var i = leftItem; i <= rightItem; i++) {
                drawItem(i, initialItem, currentPosition);
            }

            var len = labelElements.length;
            lastUnusedLabel = null;
            for (var j = 0; j < len; j++) {
                var l = labelElements[j];
                if (l.drawingFlip != drawingFlip) {
                    lastUnusedLabel = l;
                    l.element.style.display = 'none';
                } else {
                    l.element.style.display = 'block';
                }
            }

            return shouldStop;
        };

        // finalizeLabelVisibility - makes sure only one label is visible at highest opacity.
        var finalizeLabelVisibility = function() {
            var ho = 0;
            var h;

            var i = labelElements.length;
            while (i--) {
                var l = labelElements[i];
                if (l.opacity > ho) {
                    ho = l.opacity;
                    if (h) h.element.style.display = 'none'; // hide less high elements
                    h = l;
                } else {
                    l.element.style.display = 'none'; // hide if lower
                }
            }
            setOpacity(h.element, 1);
        };

        // startAnimation - starts the animation.
        var startAnimation = function() {
            endAnimation();
            var lastScrollStep;

            scrollTimeout = window.setInterval(function(){
                scrollOffset += scrollStep;

                // in case do not need to draw a new offset, let's save some cpu cycles.
                if (scrollStep == 0) {
                    if (scrollStep != lastScrollStep) finalizeLabelVisibility(); // and fix the labels.
                } else {
                    var shouldStop = draw();
                    if (shouldStop) scrollOffset -= scrollStep;
                }

                lastScrollStep = scrollStep;
            }, drawInterval);
        };

        // endAnimation - ends the animation.
        var endAnimation = function() {
            if (scrollTimeout) window.clearInterval(scrollTimeout);
            finalizeLabelVisibility(); // just to be sure.
        };

        // bindMouse - binds mouse event handlers the carousel.
        var bindMouse = function() {
            var rootLeft = $(container).offset().left;
            var inc = speed / 1000;

            $(container).mouseenter(function(){
                startAnimation();
            }).mouseleave(function(){
                endAnimation();
            }).mousemove(function(e){
                if (!scrollTimeout) startAnimation();
                var x = e.clientX - rootLeft;
                var segment = Math.floor(x / ((width + imageWidth) / 3));

                if (segment == 0) { // left
                    scrollStep = -inc;
                } else if (segment == 1) { // middle
                    scrollStep = 0;
                } else if (segment == 2) { // right
                    scrollStep = inc;
                }
            });
        };

        // init - initializes the carousel.
        var init = function(root) {
            //var d1 = new Date();
            container = root;

            // add an IE specific class so we can apply some CSS fixes.
            if ($.browser.msie) $(container).addClass('carousel-ie');

            // create three labels - which should be enough for smooth cycling.
            $(container).append('<a href="foo" class="carousel-label">&nbsp;</a>\
            <a href="foo" class="carousel-label">&nbsp;</a>\
            <a href="foo" class="carousel-label">&nbsp;</a>\
            ');

            // we fill the label elements array to keep track of who is using the labels
            $(container).find('> .carousel-label').each(function(){
                labelElements.push({
                    element : this,
                    usedBy : undefined
                });
            });

            containerWidth = $(root).width();
            containerHeight = $(root).height();

            // get the complete list
            list = $(root).find('> ul > li');
            listLength = list.length;
            if (listLength == 0) return;

            // debug >= 1: show numbers next to the images
            if (debug >= 1) {
                $(list).each(function(i){
                    $(this).append('<span class="dbg">' + i + '</span>');
                });
            }

            width = containerWidth - imageWidth;
            height = containerHeight - imageHeight - 30;

            // we get the number in the list that should be visible in the middle
            initialItem = getInitialItem(listLength);

            bindMouse();
            draw();
            //var d2 = new Date();
            //alert(d2 - d1);
        };
        
        init(element);
    };  
})(window);
