// Dialogue definition.
CKEDITOR.dialog.add( 'mediabox', function( editor ) {
  var styles = {},
    commonLang = editor.lang.common;

  function initElementStyle(stylesField) {
    stylesField.items = [[ editor.lang.common.notSet, '' ]];
    stylesField.clear();
    stylesField.add(editor.lang.common.notSet, '');
    styles = {};
  }

  /**
   * @param CKEDITOR.ui.dialog.radio
   * @param bool
   */
  function _toggleRadiosActive(radioField, enable) {
    // There must be a better way to do this as ._. is supposed to be
    // internal only.
    var children = radioField._.children;
    radioField.disable();
    for (var i = 0; i < children.length; i++) {
      children[i][enable ? 'enable' : 'disable']();
    }
  }

  return {
    title: 'Edit Media item',
    minWidth: 200,
    minHeight: 100,
    contents: [
      {
        id: 'info',
        elements: [
          {
            id: 'elementStyle',
            type: 'select',
            label: editor.lang.div.styleSelectLabel,
            'default': '',
            // Options are loaded dynamically.
            items: [
              [ editor.lang.common.notSet, '' ]
            ],
            setup: function( widget ) {
              for ( var name in styles ) {
                //styles[ name ].checkElementRemovable( widget.element, true, editor ) && this.setValue( name, 1 );
                widget.checkStyleActive(styles[ name ]) && this.setValue( name, 1 );
              }
            },
            commit: function( widget ) {
              var styleName;
              for (var name in styles) {
                widget.removeStyle( styles[ name ] );
              }
              if ( ( styleName = this.getValue() ) ) {
                var style = styles[ styleName ];
                // Hack to allow an element style to be applied to a widget.
                // We use widget.applyStyle() instead of editor.applyStyle( style )
                // because the former does not check if the style is allowed.
                widget.applyStyle( style );
              }
            }
          },
          {
            id: 'align',
            type: 'radio',
            items: [
              [ commonLang.alignNone, 'none' ],
              [ commonLang.alignLeft, 'left' ],
              [ commonLang.alignCenter, 'center' ],
              [ commonLang.alignRight, 'right' ]
            ],
            label: commonLang.align,
            setup: function( widget ) {
              this.setValue( widget.data.align );
            },
            commit: function( widget ) {
              widget.setData( 'align', this.getValue() );
            }
          },
          {
            id: 'width',
            type: 'text',
            label: 'Width',
            setup: function( widget ) {
              this.setValue( widget.data.width );
            },
            commit: function( widget ) {
              widget.setData( 'width', this.getValue() );
            }
          },
          {
            id: 'height',
            type: 'text',
            label: 'Height',
            setup: function( widget ) {
              this.setValue( widget.data.height );
            },
            commit: function( widget ) {
              widget.setData( 'height', this.getValue() );
            }
          }
        ]
      }
    ],

    onShow: function() {
      // Preparing for the 'elementStyle' field.
      var dialog = this,
        stylesField = this.getContentElement( 'info', 'elementStyle' ),
        alignField = this.getContentElement( 'info', 'align' ),
        widthField = this.getContentElement( 'info', 'width' ),
        heightField = this.getContentElement( 'info', 'height' ),
        // Hopefully this is reliable enough as there currently no other
        // way to get the element within "onShow".
        // @see ticket: #12374.
        widget = editor.widgets.focused;

      // Currently only supporting these options for images.
      if (widget.element.getName() != 'img') {
        _toggleRadiosActive(alignField, false);
        alignField.getElement().hide();
        widthField.disable();
        widthField.getElement().hide();
        heightField.disable();
        heightField.getElement().hide();
      } else {
        // Radios must be re-enabled.
        _toggleRadiosActive(alignField, true);
        alignField.getElement().show();
        widthField.getElement().show();
        heightField.getElement().show();
      }

      // Reset the styles object
      initElementStyle(stylesField);
      // Reuse the 'stylescombo' plugin's styles definition.
      editor.getStylesSet( function( stylesDefinitions ) {
        var styleName, style;

        if ( stylesDefinitions ) {
          // Digg only those styles that apply to the element or widget.
          for ( var i = 0; i < stylesDefinitions.length; i++ ) {
            var styleDefinition = stylesDefinitions[ i ];
            if ( (styleDefinition.element && styleDefinition.element == widget.element.getName())
              || (styleDefinition.type == 'widget' && styleDefinition.widget == 'mediabox')
            ) {
              styleName = styleDefinition.name;
              styles[ styleName ] = style = new CKEDITOR.style( styleDefinition );
              if ( style.widget || editor.filter.check( style ) ) {
                // Populate the styles field options with style name.
                stylesField.items.push( [ styleName, styleName ] );
                stylesField.add( styleName, styleName );
              }
            }
          }
        }

        // We should disable the content element
        // it if no options are available at all.
        stylesField[ stylesField.items.length > 1 ? 'enable' : 'disable' ]();

        // Now setup the field value manually if dialog was opened on element. (#9689)
        setTimeout( function() {
          dialog._element && stylesField.setup( dialog._element );
        }, 0 );
      } );
    },
  };
} );
