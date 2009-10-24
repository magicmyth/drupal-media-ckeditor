<?php
// $Id$

/**
 * @file
 * This file contains the admin functions for the Media module.
 */

/**
 * Provide per content type settings.
 *
 * @param array &form
 *  A form structured array.
 * @param string $type_name
 *  A string representing the content type.
 * @return
 *  Nothing is returned.
 */
function media_settings_content_type(&$form, $type_name = NULL) {
  $form['media'] = array(
    '#type'        => 'fieldset',
    '#title'       => t('Media settings'),
    '#collapsible' => TRUE,
    '#group'       => 'additional_settings',
  );

  $type = _media_content_field_types($type_name);

  // Master settings override.
  $form['media']['media_'. $type_name .'_override'] = array(
    '#title'         => t($type->name .' overrides default values'),
    '#type'          => 'checkbox',
    '#description'   => t('Override the default settings for this content type.  The options below will only be used if this box is checked.'),
    '#default_value' => variable_get('media_'. $type_name .'_override', NULL),
  );
  $form['media']['media_'. $type_name .'_enabled'] = array(
    '#title'         => t('Enable Media resource browser'),
    '#type'          => 'checkbox',
    '#description'   => t('Enable the Media resource browser for this node type.'),
    '#default_value' => variable_get('media_'. $type_name .'_enabled', NULL),
  );

  // Extract the fields for this node type
  if (isset($type->fields)) {
    foreach ((array)$type->fields as $field_name => $field) {
      // Create the field identifier
      $form['media'][$field['field_name']] = array(
        '#type'        => 'fieldset',
        '#title'       => t('Field name: !name', array('!name' => $field['widget']['label'])),
        '#collapsible' => 'true',
      );

      // Build a form for each type of module that we have
      foreach (media_registration_kinds() as $kind) {
        // Get all the kinds that match this field
        if ($registrations = media_get_fields($field['type'], $kind)) {
          $options = array();

          foreach ($registrations as $id => $registration) {
            $options[$field['field_name'] .'--'. $id] = $registration['name'] .': '. $registration['description'];
          }

          $form['media'][$field['field_name']]['media_'. $type_name .'_'. $field['field_name'] .'_'. $kind] = array(
            '#title'         => t('Enable !kind options for this field', array('!kind' => $kind)),
            '#description'   => t('Choose which !kind options you would like to have enabled on this field', array('!kind' => $kind)),
            '#type'          => 'checkboxes',
            '#options'       => $options,
            '#default_value' => variable_get('media_'. $type_name .'_'. $field['field_name'] .'_'. $kind, array()),
          );
        }
      }
    }

    // if we didn't get any additional data, remove this field form
    // this is ugly but hey, sue me
    if (count($form['media'][$field['field_name']]) == 3) {
      unset($form['media'][$field['field_name']]);
    }
  }
}

/**
 * Provide global settings.
 *
 * Global settings are currently just defaults for content types.
 *
 * @param $form
 *  A form structure.
 * @return
 *  A form structured array.
 */
function media_settings_global($form) {
  $settings_form = array();

  $settings_form['media_global_enabled'] = array(
    '#title'         => t('Media resource browser'),
    '#type'          => 'checkbox',
    '#description'   => t('Enable or Disable the Media resource browser for all types, unless specifically set for a given type.'),
    '#default_value' => variable_get('media_global_enabled', 1),
  );

  return system_settings_form($settings_form);
}

/**
 * Menu callback.  Display the list or thumbnails media admin display.
 */
function media_admin($form, $form_state, $display = NULL) {
  
  if (!$display) {
    drupal_goto('admin/content/media/list');
  }

  // Load our css.
  drupal_add_css(drupal_get_path('module', 'media') . '/media.css');
  
  if (isset($form_state['values']['operation']) && $form_state['values']['operation'] == 'delete') {
    return media_multiple_delete_confirm($form, $form_state, array_filter($form_state['values']['files']));
  }
  
  // Build the 'Update options' form.
  $form[] = media_admin_operations();
  
  switch ($display) {
    case 'list':
      $form['admin'] = media_admin_list();
      break;
    case 'thumbnails':
      $form['admin'] = media_admin_thumbnails();
      // $form['#theme] = 'media_admin_thumbnails';
      break;
  }
  return $form;
}

/**
 * Form builder: Builds the media list administration overview.
 */
function media_admin_list() {
  $path = drupal_get_path('module', 'media');
  
  // Build the sortable table header.
  $header = array(
   'title' => array('data' => t('Title'), 'field' => 'f.filename'),
   'type' => array('data' => t('Type'), 'field' => 'f.filemime'),
   'size' => array('data' => t('Size'), 'field' => 'f.filesize'),
   'author' => array('data' => t('Author'), 'field' => 'u.name'),
   'timestamp' => array('data' => t('Updated'), 'field' => 'f.timestamp', 'sort' => 'desc'),
   'operations' => array('data' => t('Operations')),
  );

  $query = db_select('file', 'f')->extend('PagerDefault')->extend('TableSort');
  $query->join('users', 'u', 'f.uid = u.uid');

  $result = $query
   ->fields('f')
   ->fields('u', array('name'))
   ->limit(50)
   ->execute();

  $destination = drupal_get_destination();
  $files = array();
  $options = array();
  foreach ($result as $file) {
   $options[$file->fid] = array(
     'title' => theme('file_link', array('file' => $file)),
     'type' =>  check_plain($file->filemime),
     'size' => t('@size KB', array('@size' => number_format($file->filesize / 1000, 0))),
     'author' => theme('username', array('account' => $file)),
     'timestamp' => format_date($file->timestamp, 'short'),
   );
   $options[$file->fid]['operations'] = l(t('edit'), 'admin/content/media/' . $file->fid . '/edit', array('query' => $destination));
  }
  $form['files'] = array(
   '#type' => 'tableselect',
   '#header' => $header,
   '#options' => $options,
   '#empty' => t('No media available.'),
  );
  $form['pager'] = array('#markup' => theme('pager', array('tags' => NULL)));

  // Build the display switch.
  $form = media_admin_display_switch($form);

  return $form;
}

/**
 * Form builder: Builds the media thumbnails administration overview.
 */
function media_admin_thumbnails() {
  $path = drupal_get_path('module', 'media');

  $query = db_select('file', 'f')->extend('PagerDefault')->extend('TableSort');
  $query->join('users', 'u', 'f.uid = u.uid');

  $result = $query
   ->fields('f')
   ->fields('u', array('name'))
   ->limit(50)
   ->execute();

  $destination = drupal_get_destination();
  $rows = array();
  $options = array();
  foreach ($result as $file) {
   $options[$file->fid] = theme('media_admin_thumbnail', array('file' => $file));
  }
  
  $form['files'] = array(
   '#type' => 'checkboxes',
   '#options' => $options,
  );
  
  $form['pager'] = array('#markup' => theme('pager', array('tags' => NULL)));
  
  // Build the display switch.
  $form = media_admin_display_switch($form);

  return $form;
}

/**
 * Build the operations portion of the file listing forms.
 */
function media_admin_operations() {
  
  // Build the 'Update options' form.
  $form['options'] = array(
    '#type' => 'fieldset',
    '#title' => t('Update options'),
    '#prefix' => '<div class="container-inline">',
    '#suffix' => '</div>',
  );
  $options = array();
  foreach (module_invoke_all('media_operations') as $operation => $array) {
    $options[$operation] = $array['label'];
  }
  $form['options']['operation'] = array(
    '#type' => 'select',
    '#options' => $options,
    '#default_value' => 'delete',
  );
  $options = array();
  $form['options']['submit'] = array(
    '#type' => 'submit',
    '#value' => t('Update'),
    '#submit' => array('media_admin_submit'),
    '#validate' => array('media_admin_validate'),
  );
  return $form;
}

/**
 * Build the display switch portion of the file listings form.
 */
function media_admin_display_switch($form = array(), $form_location = 'admin/content/media') {
  $path = drupal_get_path('module', 'media');
  
  // Set up the default display types.
  $display_types = array();
  $display_types['list'] = array(
    'title' => t('List'),
    'description' => t('Display as a list.'),
    'icon' => $path . '/images/display-list.png',
    'icon_active' => $path . '/images/display-list-active.png',
  );
  $display_types['thumbnails'] = array(
    'title' => t('Thumbnails'),
    'description' => t('Display as thumbnails.'),
    'icon' => $path . '/images/display-thumbnails.png',
    'icon_active' => $path . '/images/display-thumbnails-active.png',
  );
  // Make it alterable so other modules can add additional displays.
  drupal_alter('media_display_types', $display_types);
  
  // Build the item list.
  $display_items = array();
  foreach ($display_types as $delta => $item) {
    // Set a seperate icon for the active item.
    #if ($location . '/' . $delta in active trail) {
    #  $icon = $item['icon_active'];
    #}
    #else {
      $icon = $item['icon'];
    #}
    
    $display_items[] = array(
      'data' => l(theme('image', array('path' => $item['icon'], 'alt' => $item['title'])),
        $form_location . '/' . $delta,
        array(
          'html' => TRUE,
          'attributes' => array('title' => $item['description']),
        )),
      'class' => array('media-display-' . $delta),
    );
  }
  
  $form['display_type'] = array(
    '#type' => 'markup',
    '#markup' => theme('item_list', array(
       'items' => $display_items,
       'attributes' => array('class' => 'media-display-switch'),
      )
    ),
  );
  
  return $form;
}

/**
 * Validate media_admin_list form submissions.
 *
 * Check if any files have been selected to perform the chosen
 * 'Update option' on.
 */
function media_admin_validate($form, &$form_state) {
  $files = array_filter($form_state['values']['files']);
  if (count($files) == 0) {
    form_set_error('', t('No items selected.'));
  }
}

/**
 * Process media_admin_list form submissions.
 *
 * Execute the chosen 'Update option' on the selected files.
 */
function media_admin_submit($form, &$form_state) {
  $operations = module_invoke_all('media_operations');
  $operation = $operations[$form_state['values']['operation']];
  // Filter out unchecked nodes
  $files = array_filter($form_state['values']['files']);
  if ($function = $operation['callback']) {
    // Add in callback arguments if present.
    if (isset($operation['callback arguments'])) {
      $args = array_merge(array($files), $operation['callback arguments']);
    }
    else {
      $args = array($files);
    }
    call_user_func_array($function, $args);

    cache_clear_all();
  }
  else {
    // We need to rebuild the form to go to a second step. For example, to
    // show the confirmation form for the deletion of nodes.
    $form_state['rebuild'] = TRUE;
  }
}

function media_multiple_delete_confirm($form, &$form_state, $nodes) {
  $form['file_list'] = array('#prefix' => '<ul>', '#suffix' => '</ul>', '#tree' => TRUE);
  $files = $form_state['values']['files'];
  // array_filter returns only elements with TRUE values
  foreach ($files as $fid => $value) {
    $title = db_query('SELECT filename FROM {file} WHERE fid = :fid', array(':fid' => $fid))->fetchField();
    $form['files'][$fid] = array(
      '#type' => 'hidden',
      '#value' => $fid,
      '#prefix' => '<li>',
      '#suffix' => check_plain($title) . "</li>\n",
    );
  }
  $form['operation'] = array('#type' => 'hidden', '#value' => 'delete');
  $form['#submit'][] = 'media_multiple_delete_confirm_submit';
  $confirm_question = format_plural(count($form['file_list']),
                                  'Are you sure you want to delete this item?',
                                  'Are you sure you want to delete these items?');
  return confirm_form($form,
                    $confirm_question,
                    'admin/content/media', t('This action cannot be undone.'),
                    t('Delete'), t('Cancel'));
}

function media_multiple_delete_confirm_submit($form, &$form_state) {
  if ($form_state['values']['confirm']) {
    foreach ($form_state['values']['files'] as $fid) {
      $file = array_shift(file_load($fid));
      $results[$fid] = file_delete($file);
    }
    print_r($results);  
    $count = count($form_state['values']['files']);
    watchdog('media', 'Deleted @count files.', array('@count' => $count));
    drupal_set_message(t('Deleted @count files.', array('@count' => $count)));
  }
  $form_state['redirect'] = 'admin/content/media';
}


/**
 * Implement hook_media_operations().
 */
function media_media_operations() {
  $operations = array(
    'delete' => array(
      'label' => t('Delete'),
      'callback' => NULL,
    ),
  );
  return $operations;
}

/**
 * Form builder: Builds the edit file form.
 */
function media_edit($form, $files) {
  $file = $files['args'][0];
  drupal_set_title($file->filename);
  $form['title'] = array(
    '#title' => t('Title'),
    '#type' => 'textfield',
    '#required' => TRUE,
    '#default_value' => $file->filename,
  );
  $form['submit'] = array(
    '#type' => 'submit',
    '#value' => t('Save'),
  );
  $form['file'] = array(
    '#type' => 'hidden',
    '#value' => $file->fid,
  );
  $form['#redirect'] = 'admin/content/media';
  return $form;
}

function media_edit_validate($form, &$form_state) {
  // TODO: validate the edit form.
}

/**
 * Process media_edit form submissions.
 */
function media_edit_submit($form, &$form_state) {
  $file = file_load($form_state['values']['file']);
  print_r($file);
  $file->filename = $form_state['values']['title'];
  file_save($file);
}