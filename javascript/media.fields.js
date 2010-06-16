// $Id$

(function ($) {

/**
 * Loads media browsers and callbacks, specifically for media as a field.
 */
Drupal.behaviors.mediaBrowserFields = {
  attach: function (context, settings) {
    // For each media field on the page.
    $('.field-type-media', context).each(function () {

      // Options set from media.fields.inc for the types, etc to show in the browser.
      var options = Drupal.settings.media.fields[this.id];
      
      // For each widget (in case of multi-entry)
      $('.media-widget', this).once('mediaBrowserLaunch', function () {

        //options = Drupal.settings.media.fields[this.id];
        var fidField = $('.fid', this);
        var previewField = $('.preview', this);

        // When someone clicks the link to pick media (or clicks on an existing thumbnail)
        $('.launcher', this).bind('click', function () {
          // Launch the browser, providing the following callback function
          // @TODO: This should not be an anomyous function.
          Drupal.media.popups.mediaBrowser(function (mediaFiles) {
            if (mediaFiles.length < 0) {
              return;
            }
            var mediaFile = mediaFiles[0];
            // Set the value of the filefield fid (hidden).
            fidField.val(mediaFile.fid);
            // Set the preview field HTML
            previewField.html(mediaFile.preview);
          }, options.global);
          return false;
        });

        $('.media-edit-link', this).bind('click', function () {
          var fid = fidField.val();
          if (fid) {
            Drupal.media.popups.mediaFieldEditor(fid, function (r) { alert(r); });
          }
          return false;

          $('<iframe></iframe>')
            .attr('src', $(this).attr('href'))
            .dialog({
              height:500,
              width:500
            });
          return false;
        });

      });
    });
  }
};

})(jQuery);
