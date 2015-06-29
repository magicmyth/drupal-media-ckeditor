/*
Copyright (c) 2003-2013, CKSource - Frederico Knabben. All rights reserved.
For licensing, see LICENSE.html or http://ckeditor.com/license
*/

/**
 * @file Plugin for inserting images from Drupal media module
 *
 * @TODO Remove all the legecy media wrapper once it's sure nobody uses that
 * anymore.
 */
( function($) {
  var alignmentsObj = { left: 0, center: 1, right: 2 };

  /**
    * Create a macro representation of the inserted media element.
    *
    * @param element (jQuery object)
    *    A media element with attached serialized file info.
    */
  function create_macro(element) {
    var file_info = extract_file_info(element);
    if (file_info) {
      return '[[' + JSON.stringify(file_info) + ']]';
    }
    return false;
  }

  function replaceTokenWithPlaceholder(token) {
    Drupal.media.filter.ensure_tagmap();

    if (token.indexOf('"type":"media"') == -1) {
      console.log("not media token");
      return token;
    }

    // Check if the macro exists in the tagmap. This ensures backwards
    // compatibility with existing media and is moderately more efficient
    // than re-building the element.
    var media = Drupal.settings.tagmap[token];
    var media_json = token.replace('[[', '').replace(']]', '');

    // Ensure that the media JSON is valid.
    try {
      var media_definition = JSON.parse(media_json);
    }
    catch (err) {
      // @todo: error logging.
      // Content should be returned to prevent an empty editor.
      return token;
    }

    // Re-build the media if the macro has changed from the tagmap.
    if (!media && media_definition.fid) {
      Drupal.media.filter.ensureSourceMap();
      var source = Drupal.settings.mediaSourceMap[media_definition.fid];
      if (source) {
        media = document.createElement(source.tagName);
        media.src = source.src;
      }
    }
    // We seem to lack what we need for this token. Lets leave it alone.
    if (!media) return token;

    // Temporary work around so we can keep using
    // Drupal.media.filter.create_element(). Within that file if a link
    // link text override is set it will replace the content of anything
    // that is wrapped in a link.
    media_definition.link_text = null;
    // jQuery will fail if html strings are passed that containing any
    // whitespace around the outer HTML. With Drupal's template system
    // this can easily happen so always trim the passed string.
    media = media.trim();
    // Apply attributes.
    var element = Drupal.media.filter.create_element(media, media_definition);
    var markup  = Drupal.media.filter.outerHTML(element);

    return markup;
  }

  /**
    * Extract the file info from a WYSIWYG placeholder element as JSON.
    *
    * @param element (jQuery object)
    *    A media element with associated file info via a file id (fid).
    */
  function extract_file_info(element) {
    var fid, file_info, value;

    if (fid = element.data('fid')) {
      Drupal.media.filter.ensureDataMap();

      if (file_info = Drupal.settings.mediaDataMap[fid]) {
        file_info.attributes = {};

        $.each(Drupal.settings.media.wysiwyg_allowed_attributes, function(i, a) {
          if (value = element.attr(a)) {
            // Replace &quot; by \" to avoid error with JSON format.
            if (typeof value == 'string') {
              value = value.replace('&quot;', '\\"');
            }
            file_info.attributes[a] = value;
          }
        });

      }
    }

    return file_info;
  }

  function prepareDataForWysiwygMode(data) {
    data = replaceTokenWithPlaceholder(data);
    // Legacy media wrapper.
    mediaPluginDefinition.mediaLegacyWrappers = (data.indexOf("<!--MEDIA-WRAPPER-START-") !== -1);
    if (mediaPluginDefinition.mediaLegacyWrappers) {
      data = data.replace(/<!--MEDIA-WRAPPER-START-(\d+)-->(.*?)<!--MEDIA-WRAPPER-END-\d+-->/gi, '<mediawrapper data="$1">$2</mediawrapper>');
    }
    return data;
  }
  function prepareDataForSourceMode(markup) {
    // Legacy wrapper
    if (mediaPluginDefinition.mediaLegacyWrappers) {
      markup = data.replace(/<mediawrapper data="(.*)">(.*?)<\/mediawrapper>/gi, '<!--MEDIA-WRAPPER-START-$1-->$2<!--MEDIA-WRAPPER-END-$1-->');
    }
    var macro = create_macro($(markup));
    Drupal.settings.tagmap[macro] = markup;

    return macro;
  }

  // Defines all features related to drag-driven image resizing.
  //
  // This has been near wholesale stolen from the image2 plugin. Credits go
  // the Image2 devs.
  //
  // @param {CKEDITOR.plugins.widget} widget
  function setupResizer( widget ) {
    var editor = widget.editor,
      editable = editor.editable(),
      doc = editor.document,

      // Store the resizer in a widget for testing (#11004).
      resizer = widget.resizer = doc.createElement( 'span' );

    resizer.addClass( 'cke_mediabox_resizer' );
    resizer.setAttribute( 'title', 'Resize' );
    resizer.append( new CKEDITOR.dom.text( '\u200b', doc ) );

    // Inline widgets don't need a resizer wrapper as an image spans the entire widget.
    if ( !widget.inline ) {
      var imageOrLink = widget.parts.link || widget.parts.image,
        oldResizeWrapper = imageOrLink.getParent(),
        resizeWrapper = doc.createElement( 'span' );

      resizeWrapper.addClass( 'cke_mediabox_resizer_wrapper' );
      resizeWrapper.append( imageOrLink );
      resizeWrapper.append( resizer );
      widget.element.append( resizeWrapper, true );

      // Remove the old wrapper which could came from e.g. pasted HTML
      // and which could be corrupted (e.g. resizer span has been lost).
      if ( oldResizeWrapper.is( 'span' ) )
        oldResizeWrapper.remove();
    } else {
      widget.wrapper.append( resizer );
    }

    // Calculate values of size variables and mouse offsets.
    resizer.on( 'mousedown', function( evt ) {
      var image = widget.element,

        // "factor" can be either 1 or -1. I.e.: For right-aligned images, we need to
        // subtract the difference to get proper width, etc. Without "factor",
        // resizer starts working the opposite way.
        factor = widget.data.align == 'right' ? -1 : 1,

        // The x-coordinate of the mouse relative to the screen
        // when button gets pressed.
        startX = evt.data.$.screenX,
        startY = evt.data.$.screenY,

        // The initial dimensions and aspect ratio of the image.
        startWidth = image.$.clientWidth,
        startHeight = image.$.clientHeight,
        ratio = startWidth / startHeight,

        listeners = [],

        // A class applied to editable during resizing.
        cursorClass = 'cke_image_s' + ( !~factor ? 'w' : 'e' ),

        nativeEvt, newWidth, newHeight, updateData,
        moveDiffX, moveDiffY, mpartsoveRatio;

      // Save the undo snapshot first: before resizing.
      editor.fire( 'saveSnapshot' );

      // Mousemove listeners are removed on mouseup.
      attachToDocuments( 'mousemove', onMouseMove, listeners );

      // Clean up the mousemove listener. Update widget data if valid.
      attachToDocuments( 'mouseup', onMouseUp, listeners );

      // The entire editable will have the special cursor while resizing goes on.
      editable.addClass( cursorClass );

      // This is to always keep the resizer element visible while resizing.
      resizer.addClass( 'cke_mediabox_resizing' );

      // Attaches an event to a global document if inline editor.
      // Additionally, if classic (`iframe`-based) editor, also attaches the same event to `iframe`'s document.
      function attachToDocuments( name, callback, collection ) {
        var globalDoc = CKEDITOR.document,
          listeners = [];

        if ( !doc.equals( globalDoc ) )
          listeners.push( globalDoc.on( name, callback ) );

        listeners.push( doc.on( name, callback ) );

        if ( collection ) {
          for ( var i = listeners.length; i--; )
            collection.push( listeners.pop() );
        }
      }

      // Calculate with first, and then adjust height, preserving ratio.
      function adjustToX() {
        newWidth = startWidth + factor * moveDiffX;
        newHeight = Math.round( newWidth / ratio );
      }

      // Calculate height first, and then adjust width, preserving ratio.
      function adjustToY() {
        newHeight = startHeight - moveDiffY;
        newWidth = Math.round( newHeight * ratio );
      }

      // This is how variables refer to the geometry.
      // Note: x corresponds to moveOffset, this is the position of mouse
      // Note: o corresponds to [startX, startY].
      //
      // +--------------+--------------+
      // |              |              |
      // |      I       |      II      |
      // |              |              |
      // +------------- o -------------+ _ _ _
      // |              |              |      ^
      // |      VI      |     III      |      | moveDiffY
      // |              |         x _ _ _ _ _ v
      // +--------------+---------|----+
      //                |         |
      //                 <------->
      //                 moveDiffX
      function onMouseMove( evt ) {
        nativeEvt = evt.data.$;

        // This is how far the mouse is from the point the button was pressed.
        moveDiffX = nativeEvt.screenX - startX;
        moveDiffY = startY - nativeEvt.screenY;

        // This is the aspect ratio of the move difference.
        moveRatio = Math.abs( moveDiffX / moveDiffY );

        // Left, center or none-aligned widget.
        if ( factor == 1 ) {
          if ( moveDiffX <= 0 ) {
            // Case: IV.
            if ( moveDiffY <= 0 )
              adjustToX();

            // Case: I.
            else {
              if ( moveRatio >= ratio )
                adjustToX();
              else
                adjustToY();
            }
          } else {
            // Case: III.
            if ( moveDiffY <= 0 ) {
              if ( moveRatio >= ratio )
                adjustToY();
              else
                adjustToX();
            }

            // Case: II.
            else {
              adjustToY();
            }
          }
        }

        // Right-aligned widget. It mirrors behaviours, so I becomes II,
        // IV becomes III and vice-versa.
        else {
          if ( moveDiffX <= 0 ) {
            // Case: IV.
            if ( moveDiffY <= 0 ) {
              if ( moveRatio >= ratio )
                adjustToY();
              else
                adjustToX();
            }

            // Case: I.
            else {
              adjustToY();
            }
          } else {
            // Case: III.
            if ( moveDiffY <= 0 )
              adjustToX();

            // Case: II.
            else {
              if ( moveRatio >= ratio ) {
                adjustToX();
              } else {
                adjustToY();
              }
            }
          }
        }

        // Don't update attributes if less than 10.
        // This is to prevent images to visually disappear.
        if ( newWidth >= 15 && newHeight >= 15 ) {
          // @todo make this configurable so we can use attributes.
          // image.setAttributes( { width: newWidth, height: newHeight } );
          image.setStyles( { width: newWidth + 'px', height: newHeight + 'px' } );
          updateData = true;
        } else {
          updateData = false;
        }
      }

      function onMouseUp() {
        var l;

        while ( ( l = listeners.pop() ) )
          l.removeListener();

        // Restore default cursor by removing special class.
        editable.removeClass( cursorClass );

        // This is to bring back the regular behaviour of the resizer.
        resizer.removeClass( 'cke_mediabox_resizing' );

        if ( updateData ) {
          widget.setData( { width: newWidth, height: newHeight } );

          // Save another undo snapshot: after resizing.
          editor.fire( 'saveSnapshot' );
        }

        // Don't update data twice or more.
        updateData = false;
      }
    } );

    // Change the position of the widget resizer when data changes.
    widget.on( 'data', function() {
      resizer[ widget.data.align == 'right' ? 'addClass' : 'removeClass' ]( 'cke_mediabox_resizer_left' );
    } );
  }

  function setWrapperAlign( widget, alignClasses ) {
    var wrapper = widget.wrapper,
      align = widget.data.align;

    if ( alignClasses ) {
      // Remove all align classes first.
      for ( var i = 3; i--; )
        wrapper.removeClass( alignClasses[ i ] );

      wrapper.addClass( alignClasses[ alignmentsObj[ align ] ] );
    } else {
      if ( align == 'center' ) {
        wrapper.removeStyle( 'float' );
      }
      else {
        if ( align == 'none' )
          wrapper.removeStyle( 'float' );
        else
          wrapper.setStyle( 'float', align );
      }
    }
  }

  var mediaPluginDefinition = {
    icons: 'media',
    requires: ['button'],
    // Check if this instance has widget support. All the default distributions
    // of the editor have the widget plugin disabled by default.
    hasWidgetSupport: typeof(CKEDITOR.plugins.registered.widget) != 'undefined',
    mediaLegacyWrappers: false,

    onLoad: function() {
      CKEDITOR.addCss(
      'img.media-element{' +
        // This is to remove unwanted space so resize
        // wrapper is displayed property.
        'line-height:0' +
      '}' +
      '.media-element-token{' +
        'word-break: break-all;' +
      '}' +
      '.cke_mediabox_resizer{' +
        'display:none;' +
        'position:absolute;' +
        'width:10px;' +
        'height:10px;' +
        'bottom:-5px;' +
        'right:-5px;' +
        'background:#000;' +
        'outline:1px solid #fff;' +
        // Prevent drag handler from being misplaced (#11207).
        'line-height:0;' +
        'cursor:se-resize;' +
      '}' +
      '.cke_mediabox_resizer_wrapper{' +
        'position:relative;' +
        'display:inline-block;' +
        'line-height:0;' +
      '}' +
      // Bottom-left corner style of the resizer.
      '.cke_mediabox_resizer.cke_mediabox_resizer_left{' +
        'right:auto;' +
        'left:-5px;' +
        'cursor:sw-resize;' +
      '}' +
      '.cke_widget_wrapper:hover .cke_mediabox_resizer,' +
      '.cke_mediabox_resizer.cke_mediabox_resizing{' +
        'display:block' +
      '}' +
      // Expand widget wrapper when linked inline image.
      '.cke_widget_wrapper>a{' +
        'display:inline-block' +
      '}' );
    },

    // Wrap Drupal plugin in a proxy plugin.
    init: function(editor) {
      // Register the editing dialog.
      CKEDITOR.dialog.add( 'mediabox', this.path + 'dialogs/mediabox.js' );

      // Share Image2's alignment classes.
      var alignClasses = editor.config.image2_alignClasses;

      editor.addCommand( 'media',
      {
        exec: function (editor) {
          var data = {
            format: 'html',
            node: null,
            content: ''
          };
          var selection = editor.getSelection();

          if (selection) {
            data.node = selection.getSelectedElement();
            if (data.node) {
              data.node = data.node.$;
            }
            if (selection.getType() == CKEDITOR.SELECTION_TEXT) {
              if (CKEDITOR.env.ie && CKEDITOR.env.version < 10) {
                data.content = selection.getNative().createRange().text;
              }
              else {
                data.content = selection.getNative().toString();
              }
            }
            else if (data.node) {
              // content is supposed to contain the "outerHTML".
              data.content = data.node.parentNode.innerHTML;
            }
          }
          Drupal.settings.ckeditor.plugins['media'].invoke(data, Drupal.settings.ckeditor.plugins['media'], editor.name);
        }
      });

      editor.ui.addButton( 'Media',
      {
        label: 'Add media',
        command: 'media',
        icon: this.path + 'images/icon.gif'
      });

      var ckeditorversion = parseFloat(CKEDITOR.version);

      // Because the media comment wrapper don't work well for CKEditor we
      // replace them by using a custom mediawrapper element.
      // Instead having
      // <!--MEDIA-WRAPPER-START-1--><img /><!--MEDIA-WRAPPER-END-1-->
      // We wrap the placeholder with
      // <mediawrapper data="1"><img /></mediawrapper>
      // That way we can deal better with selections - see selectionChange.
      CKEDITOR.dtd['mediawrapper'] = CKEDITOR.dtd;
      CKEDITOR.dtd.$blockLimit['mediawrapper'] = 1;
      CKEDITOR.dtd.$inline['mediawrapper'] = 1;
      CKEDITOR.dtd.$nonEditable['mediawrapper'] = 1;
      if (ckeditorversion >= 4.1) {
        // Register allowed tag for advanced filtering.
        editor.filter.allow( 'mediawrapper[!data]', 'mediawrapper', true);
        // Don't remove the data-file_info attribute added by media!
        editor.filter.allow( '*[!data-file_info]', 'mediawrapper', true);
        // Ensure image tags accept all kinds of attributes.
        editor.filter.allow( 'img[*]{*}(*)', 'mediawrapper', true);
        // Objects should be selected as a whole in the editor.
        CKEDITOR.dtd.$object['mediawrapper'] = 1;
      }

      // Ensure the tokens are replaced by placeholders while editing.
      // Check for widget support.
      if (mediaPluginDefinition.hasWidgetSupport) {
        editor.widgets.add( 'mediabox',
        {
          button: 'Create a mediabox',
          // NOTE: The template will never actually be used but Widget requires it.
          template: '<span class="media-element"></span>',
          editables: {},
          requiredContent: '*(!media-element)',
          allowedContent: '*',
          styleableElements: 'img',
          // This widget converts style-driven dimensions to attributes.
          // NOTE This does not seem to do anything.
          contentTransformations: [
            ['img{width,height}: sizeToStyle']
          ],
          dialog: 'mediabox',
          // Though the upcast is unlikley to be involved with this widget
          // because of how the widget is setup it's probably a good idea
          // to have this anyway.
          upcast: function( element ) {
            if ( element.hasClass('media-element') ) {
              if ( element.name == 'img' ) {
                setWrapperAlign(this, alignClasses);
              }
              return true;
            }
            return false;
          },

          downcast: function( widgetElement ) {
            var align = this.data.align;
            if (widgetElement.name == 'img' && align != 'none' ) {
              var attrs = widgetElement.attributes,
                styles = CKEDITOR.tools.parseCssText( attrs.style || '' );

              if ( align in { left: 1, right: 1 } ) {
                if ( alignClasses )
                  widgetElement.addClass( alignClasses[ alignmentsObj[ align ] ] );
                else
                  styles[ 'float' ] = align;
              } else if ( align == 'center' && alignClasses ) {
                // We only support a center class. No inline styling. Needs some discussing.
                widgetElement.addClass( alignClasses[ alignmentsObj[ align ] ] );
              }

              // Update element styles.
              if ( !alignClasses && !CKEDITOR.tools.isEmpty( styles ) )
                attrs.style = CKEDITOR.tools.writeCssText( styles );
            }
            if (widgetElement.hasClass('media-element-token')) {
              var token = widgetElement.getHtml();
            } else {
              var token = prepareDataForSourceMode(widgetElement.getOuterHtml());
            }
            return new CKEDITOR.htmlParser.text(token);
          },

          init: function() {
            var el = this.element,
              align;
            if (el.getName() == 'img') {
              // Read the initial left/right alignment from the class set on element.
              if ( alignClasses ) {
                if ( el.hasClass( alignClasses[ alignmentsObj.left ] ) ) {
                  align = 'left';
                } else if ( el.hasClass( alignClasses[ alignmentsObj.right ] ) ) {
                  align = 'right'
                } else if ( el.hasClass( alignClasses[ alignmentsObj.center ] ) ) {
                  align = 'center'
                }

                if ( align ) {
                  el.removeClass( alignClasses[ alignmentsObj[ align ] ] );
                } else {
                  align = 'none';
                }
                this.setData( 'align', align );
              }
              // Read initial float style from figure/image and then remove it.
              else {
                align = el.getStyle( 'float' ) || 'none';
                this.setData('align', align);
                el.removeStyle( 'float' );
              }

              setWrapperAlign(this, alignClasses);
              this.setData('width', el.getStyle('width') || el.getAttribute( 'width' ) || '');
              this.setData('height', el.getStyle('height') || el.getAttribute( 'height' ) || '');
              setupResizer( this );
            }
          },
          data: function() {
            var el = this.element, align = this.data.align;
            if ( el.getName() == 'img' && align ) {
              var wrapper = this.wrapper;
              if ( alignClasses ) {
                // Remove all align classes first.
                for ( var i = 3; i--; )
                  wrapper.removeClass( alignClasses[ i ] );

                if ( align != 'none' ) {
                  wrapper.addClass( alignClasses[ alignmentsObj[ align ] ] );
                }
              } else {
                if ( align == 'none' || align == 'center' )
                  wrapper.removeStyle( 'float' );
                else
                  wrapper.setStyle( 'float', align );
              }
            }
            if ( this.data.width ) {
              el.setStyle( 'width', this.data.width );
            } else {
              el.removeStyle( 'width' );
            }
            if ( this.data.height ) {
              el.setStyle( 'height', this.data.height );
            } else {
              el.removeStyle( 'height' );
            }
          }
        });
      }
      else if (ckeditorversion >= 4) {
        // CKEditor >=4.0
        editor.on('setData', function( event ) {
          event.data.dataValue = prepareDataForWysiwygMode(event.data.dataValue);
        });
      }
      else {
        // CKEditor >=3.6 behaviour.
        editor.on( 'beforeSetMode', function( event, data ) {
          event.removeListener();
          var wysiwyg = editor._.modes[ 'wysiwyg' ];
          var source = editor._.modes[ 'source' ];
          wysiwyg.loadData = CKEDITOR.tools.override( wysiwyg.loadData, function( org )
          {
            return function( data ) {
              return ( org.call( this, prepareDataForWysiwygMode(data)) );
            };
          } );
          source.loadData = CKEDITOR.tools.override( source.loadData, function( org )
          {
            return function( data ) {
              return ( org.call( this, prepareDataForSourceMode(data) ) );
            };
          } );
        });
      }

      // Provide alternative to the widget functionality introduced in 4.3.
      if (!mediaPluginDefinition.hasWidgetSupport) {
        // Ensure tokens instead the html element is saved.
        editor.on('getData', function( event ) {
          event.data.dataValue = prepareDataForSourceMode(event.data.dataValue);
        });

        // Ensure our enclosing wrappers are always included in the selection.
        editor.on('selectionChange', function( event ) {
          var ranges = editor.getSelection().getRanges().createIterator();
          var newRanges = [];
          var currRange;
          while(currRange = ranges.getNextRange()) {
            var commonAncestor = currRange.getCommonAncestor(false);
            if (commonAncestor && typeof(commonAncestor.getName) != 'undefined' && commonAncestor.getName() == 'mediawrapper') {
              var range = new CKEDITOR.dom.range( editor.document );
              if (currRange.collapsed === true) {
                // Don't allow selection within the wrapper element.
                if (currRange.startOffset == 0) {
                  // While v3 plays nice with setting start and end to avoid
                  // editing within the media wrapper element, v4 ignores that.
                  // Thus we try to move the cursor further away.
                  if (parseInt(CKEDITOR.version) > 3) {
                    range.setStart(commonAncestor.getPrevious());
                    range.setEnd(commonAncestor.getPrevious());
                  }
                  else {
                    range.setStartBefore(commonAncestor);
                  }
                }
                else {
                  // While v3 plays nice with setting start and end to avoid
                  // editing within the media wrapper element, v4 ignores that.
                  // Thus we try to move the cursor further away.
                  if (parseInt(CKEDITOR.version) > 3) {
                    range.setStart(commonAncestor.getNext(), 1);
                    range.setEnd(commonAncestor.getNext(), 1);
                  }
                  else {
                    range.setStartAfter(commonAncestor);
                  }
                }
              }
              else {
                // Always select the whole wrapper element.
                range.setStartBefore(commonAncestor);
                range.setEndAfter(commonAncestor);
              }
              newRanges.push(range);
            }
          }
          if (newRanges.length) {
            editor.getSelection().selectRanges(newRanges);
          }
        });
      }
    },

    afterInit: function( editor ) {
      var mediaTokenReplaceRegex = /\[\[.*?\]\]/g;

      editor.dataProcessor.dataFilter.addRules( {
        text: function( text, node ) {
          var dtd = node.parent && CKEDITOR.dtd[ node.parent.name ];

          // Skip the case when placeholder is in elements like <title> or <textarea>
          // but upcast placeholder in custom elements (no DTD).
          if ( dtd && !dtd.span )
            return;

          Drupal.media.filter.ensure_tagmap();
          return text.replace( mediaTokenReplaceRegex, function( match ) {
            // Creating widget code
            var widgetWrapper = null,
              media = prepareDataForWysiwygMode(match);

            if (typeof media != 'undefined') {
              var el = new CKEDITOR.dom.element.createFromHtml(media, editor.document);
              // As this happens just after the HTML has been setup and
              // CKEditor does not allow a text node (the token) to be
              // outside a block element, the token will end up within a
              // <p> tag. If this media-element is a block element then
              // upon transformation it will be moved out of the <p>
              // tag, thus leaving a new empty <p> tag upon every source
              // to HTML transformation.
              if (node.parent && el.$.nodeType == CKEDITOR.NODE_ELEMENT && CKEDITOR.dtd.$block[el.getName()] && !CKEDITOR.dtd.$blockLimit[node.parent.name]) {
                if (node.parent.children.length < 2) {
                  node.parent.replaceWithChildren();
                }
              }

              var widgetWrapper = '';
              if ( el.$.nodeType == CKEDITOR.NODE_ELEMENT ) {
                widgetWrapper = editor.widgets.wrapElement( el, 'mediabox' ).getOuterHtml();
              } else if ( el.$.nodeType == CKEDITOR.NODE_TEXT ) {
                // If the token could not be converted then lets protect it as is.
                if (media.charAt(0) == '[' && media.substr(media.length -1) == ']') {
                  widgetWrapper = editor.widgets.wrapElement(
                    new CKEDITOR.dom.element.createFromHtml(
                      '<span class="media-element media-element-token">' + media + '</span>',
                      editor.document
                    ),
                    'mediabox').getOuterHtml();
                }
              }
              return widgetWrapper;
            }

            return;

          } );
        }
      } );
    }
  };
  // Add dependency to widget plugin if possible.
  if (parseFloat(CKEDITOR.version) >= 4.3 && mediaPluginDefinition.hasWidgetSupport) {
    mediaPluginDefinition.requires.push('widget');
  }
  CKEDITOR.plugins.add( 'media', mediaPluginDefinition);
} )(jQuery);
