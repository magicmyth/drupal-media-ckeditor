// Dialogue definition.
CKEDITOR.dialog.add( 'mediabox', function( editor ) {
  var styles = {};

  function initElementStyle(stylesField) {
    stylesField.items = [[ editor.lang.common.notSet, '' ]];
    stylesField.clear();
    stylesField.add(editor.lang.common.notSet, '');
    styles = {};
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
        // Hopefully this is reliable enough as there currently no other
        // way to get the element within "onShow".
        // @see ticket: #12374.
        widget = editor.widgets.focused;

      // Reset the styles object

      initElementStyle(stylesField);
      // Reuse the 'stylescombo' plugin's styles definition.
      editor.getStylesSet( function( stylesDefinitions ) {
        var styleName, style;

        if ( stylesDefinitions ) {
          // Digg only those styles that apply to 'div'.
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