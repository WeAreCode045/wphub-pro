<?php
/**
 * Plugin Name: WP Plugin Hub Connector
 * Plugin URI: https://wphub.pro
 * Description: Verbindt je WordPress site met WP Plugin Hub voor centraal plugin management
 * Version: 4.0.0
 * Author: Code045
 * License: GPL v2 or later
 */

if (!defined('ABSPATH')) exit;

class WPPluginHubConnector {
    private $platform_base_url = 'https://wphub.pro';
    
    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    public function register_rest_routes() {
        // Get WordPress version
        register_rest_route('wphub/v1', '/getWordPressVersion', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_get_wp_version'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Install plugin
        register_rest_route('wphub/v1', '/installPlugin', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_install_plugin'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Activate plugin
        register_rest_route('wphub/v1', '/activatePlugin', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_activate_plugin'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Deactivate plugin
        register_rest_route('wphub/v1', '/deactivatePlugin', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_deactivate_plugin'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Uninstall plugin
        register_rest_route('wphub/v1', '/uninstallPlugin', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_uninstall_plugin'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Get installed plugins
        register_rest_route('wphub/v1', '/getInstalledPlugins', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_get_installed_plugins'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Get installed themes
        register_rest_route('wphub/v1', '/getInstalledThemes', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_get_installed_themes'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
        
        // Ping endpoint
        register_rest_route('wphub/v1', '/ping', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_ping'),
            'permission_callback' => array($this, 'verify_api_key')
        ));
    }
    
    public function verify_api_key($request) {
        $body = $request->get_json_params();
        $provided_key = isset($body['api_key']) ? $body['api_key'] : '';
        $stored_key = get_option('wphub_api_key');
        
        return $provided_key === $stored_key && !empty($stored_key);
    }
    
    public function handle_get_wp_version($request) {
        global $wp_version;
        
        return new WP_REST_Response(array(
            'success' => true,
            'wp_version' => $wp_version,
            'message' => 'WordPress version retrieved'
        ), 200);
    }
    
    public function handle_install_plugin($request) {
        return new WP_REST_Response(array(
            'success' => false,
            'error' => 'Plugin installation via REST API is not supported in this version'
        ), 501);
    }
    
    public function handle_activate_plugin($request) {
        $body = $request->get_json_params();
        $plugin_slug = $body['plugin_slug'];
        
        error_log('WP Plugin Hub: Activating plugin: ' . $plugin_slug);
        
        if (!function_exists('activate_plugin')) {
            require_once(ABSPATH . 'wp-admin/includes/plugin.php');
        }
        
        // Find the plugin file
        $plugins = get_plugins();
        $plugin_file = null;
        
        foreach ($plugins as $file => $data) {
            // Calculate slug the same way as in handle_get_installed_plugins
            $slug = dirname($file);
            if ($slug === '.') {
                $slug = basename($file, '.php');
            }
            
            if ($slug === $plugin_slug || $file === $plugin_slug) {
                $plugin_file = $file;
                break;
            }
        }
        
        if (!$plugin_file) {
            return new WP_REST_Response(array(
                'success' => false,
                'error' => 'Plugin not found'
            ), 404);
        }
        
        $result = activate_plugin($plugin_file);
        
        if (is_wp_error($result)) {
            return new WP_REST_Response(array(
                'success' => false,
                'error' => $result->get_error_message()
            ), 500);
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'Plugin activated successfully'
        ), 200);
    }
    
    public function handle_deactivate_plugin($request) {
        $body = $request->get_json_params();
        $plugin_slug = $body['plugin_slug'];
        
        error_log('WP Plugin Hub: Deactivating plugin: ' . $plugin_slug);
        
        if (!function_exists('deactivate_plugin')) {
            require_once(ABSPATH . 'wp-admin/includes/plugin.php');
        }
        
        // Find the plugin file
        $plugins = get_plugins();
        $plugin_file = null;
        
        foreach ($plugins as $file => $data) {
            // Calculate slug the same way as in handle_get_installed_plugins
            $slug = dirname($file);
            if ($slug === '.') {
                $slug = basename($file, '.php');
            }
            
            if ($slug === $plugin_slug || $file === $plugin_slug) {
                $plugin_file = $file;
                break;
            }
        }
        
        if (!$plugin_file) {
            return new WP_REST_Response(array(
                'success' => false,
                'error' => 'Plugin not found'
            ), 404);
        }
        
        deactivate_plugin($plugin_file);
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'Plugin deactivated successfully'
        ), 200);
    }
    
    public function handle_uninstall_plugin($request) {
        return new WP_REST_Response(array(
            'success' => false,
            'error' => 'Plugin deletion via REST API is not supported in this version'
        ), 501);
    }
    
    
    public function add_admin_menu() {
        add_options_page(
            'WP Plugin Hub',
            'WP Plugin Hub',
            'manage_options',
            'wp-plugin-hub',
            array($this, 'settings_page')
        );
    }
    
    public function register_settings() {
        register_setting('wphub_settings', 'wphub_api_key');
    }
    
    public function handle_get_installed_plugins($request) {
        $plugins = get_plugins();
        $installed = array();
        
        foreach ($plugins as $plugin_file => $plugin_data) {
            $is_active = is_plugin_active($plugin_file);
            
            // Calculate slug: use dirname for subfolder plugins, basename for root plugins
            $slug = dirname($plugin_file);
            if ($slug === '.') {
                // Plugin in root directory, use filename without extension
                $slug = basename($plugin_file, '.php');
            }
            
            $installed[] = array(
                'name' => $plugin_data['Name'],
                'slug' => $slug,
                'version' => $plugin_data['Version'],
                'status' => $is_active ? 'active' : 'inactive',
                'file' => $plugin_file,
                'author' => $plugin_data['Author'],
                'description' => $plugin_data['Description']
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'plugins' => $installed
        ), 200);
    }
    
    public function handle_get_installed_themes($request) {
        $themes = wp_get_themes();
        $installed = array();
        $current = wp_get_theme();
        
        foreach ($themes as $theme) {
            $installed[] = array(
                'name' => $theme->get('Name'),
                'slug' => $theme->get_stylesheet(),
                'version' => $theme->get('Version'),
                'status' => $current->get_stylesheet() === $theme->get_stylesheet() ? 'active' : 'inactive',
                'author' => $theme->get('Author'),
                'screenshot' => $theme->get_screenshot(),
                'description' => $theme->get('Description')
            );
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'themes' => $installed
        ), 200);
    }
    
    public function handle_ping($request) {
        $site_id = get_option('wphub_site_id', '');
        
        return new WP_REST_Response(array(
            'ok' => true,
            'site_id' => $site_id,
            'platform_url' => $this->platform_base_url,
            'message' => 'Connector is active'
        ), 200);
    }
    
    public function settings_page() {
        ?>
        <div class="wrap">
            <h1>WP Plugin Hub Connector</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('wphub_settings');
                do_settings_sections('wphub_settings');
                ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">API Key</th>
                        <td>
                            <input type="text" name="wphub_api_key" 
                                   value="<?php echo esc_attr(get_option('wphub_api_key')); ?>" 
                                   class="regular-text" />
                            <p class="description">Voer de API key in van je WP Plugin Hub site</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <hr>
            
            <h2>Status</h2>
            <?php
            $api_key = get_option('wphub_api_key');
            if ($api_key) {
                echo '<p><span class="dashicons dashicons-yes-alt" style="color: green;"></span> API Key is ingesteld</p>';
                
                if (class_exists('WP_CLI')) {
                    echo '<p><span class="dashicons dashicons-yes-alt" style="color: green;"></span> WP-CLI beschikbaar</p>';
                } else {
                    echo '<p><span class="dashicons dashicons-warning" style="color: red;"></span> WP-CLI niet beschikbaar. Deze plugin vereist WP-CLI.</p>';
                }
            } else {
                echo '<p><span class="dashicons dashicons-warning" style="color: orange;"></span> API Key is niet ingesteld</p>';
            }
            ?>
        </div>
        <?php
    }
}

new WPPluginHubConnector();